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
// The arc, at $1900/week with the entry freelance rate (~$22/block, and
// energy capping a day at roughly 12 blocks):
//   solo, any state    → owes $1900/wk ≈ $271/day vs ~$264/day earnable at
//                        full grind. Not quite payable, on purpose.
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
    // Placeholder for the rent-agreement system (variable per roommate,
    // driven by relationship, income and personality) — see the plan doc.
    defaultRoommateShare: 0.15,
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
  // Funds available to buy. `expectedReturn` is annual; daily return is
  // `expectedReturn / 360 * (1 + noise)`. `volatility` is the std dev
  // of the daily noise term (0.01 = ±1% daily swing is common).
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
  // Day-rollover growth: for each fund, daily return = annual/360 ± noise.
  // The noise is seeded per-day per-fund so it's deterministic for a
  // given save (no cheating by reloading). Uses mulberry32 for a proper
  // uniform PRNG, then Box-Muller for a normal distribution.
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
    return (annualReturn / 360) + z * volatility;
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
// cadenceDays: how often the bill posts. 7=weekly, 30=monthly, 90=quarterly.
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
    id: 'electric', label: 'Electric', cadenceDays: 30, split: 'even', amount: 260,
    graceDays: 5, reconnectionFee: 40, cutoff: 'power',
  },
  water: {
    id: 'water', label: 'Water / Sewer', cadenceDays: 30, split: 'even', amount: 130,
    graceDays: 5, reconnectionFee: 35, cutoff: 'water',
  },
  gas: {
    id: 'gas', label: 'Gas / Heat', cadenceDays: 30, split: 'even', amount: 140,
    graceDays: 5, reconnectionFee: 35, cutoff: 'gas',
  },
  internet: {
    id: 'internet', label: 'Internet', cadenceDays: 30, split: 'even', amount: 80,
    graceDays: 3, reconnectionFee: 25, cutoff: 'internet',
  },
  phone: {
    id: 'phone', label: 'Phone', cadenceDays: 30, split: 'personal', amount: 65,
    // Phase 5 (decision F): the phone bill now has a real cutoff — unpaid
    // past grace kills the phone's cellular service. The phone still works
    // on home wifi while the internet is up (degraded but survivable);
    // only a total loss (wifi AND cellular down) blocks online apps.
    graceDays: 10, reconnectionFee: 0, cutoff: 'phone',
  },
  insurance: {
    id: 'insurance', label: 'Renters Insurance', cadenceDays: 30, split: 'personal', amount: 25,
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
// plan. A large lumpy obligation every 90 days that forces saving. See
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
  // quarter bills). Compounds — rolled into `unpaid` and accrues interest
  // each subsequent quarter, so ignoring taxes is a spiral, not a flat
  // fee. Interest applies to carried-forward unpaid balances.
  underpaymentPenalty: 0.08,   // 8% of the unpaid shortfall, one-time per quarter
  interestRate: 0.02,         // 2% per quarter on carried-forward unpaid balance
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

// Base costs — the fixed monthly floor on each utility bill (the
// connection charge / infrastructure cost), added to the metered total.
const UTILITY_BASE = {
  electric: 25,
  water: 15,
  gas: 12,
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
// shelf life is `def.perishable.days × container.preservation`, and the
// container's preservation multiplier lives on its OBJECT_DEFS entry
// (fridge 4.0 / pantry 2.0 / bag 1.0 / doormat 0.75 / floor 0.5 — see
// DEFS.WORLD's container block). Moving a stack between containers
// recomputes its remaining life (ITEMS' retimeStack) rather than resetting
// it.
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
const ROT = {
  graceDays: 2,                  // days a Rotten (inedible) stack sits there before it becomes a mess
  bagPreservation: 1.0,          // the player's bag is the neutral baseline (1.0 row of the preservation table)
  freshHours: 4,                 // absolute Fresh window at the 1.0 baseline — "just made", not a fraction of shelf life
  stages: { good: 0.15, stale: 0.45, spoiled: 0.75 },  // fraction-of-life ladder: Fresh/— < .15 | Stale .45 | Spoiled .75 | Rotten ≥ 1
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
  name: 'Del Connors',
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
// by one question: SIM's getActiveVisits. Ticks are 0-47 half-hour
// increments (getTickIndex, matching SCHEDULES). The soft cap applies to
// ORGANIC visits only — paid/scheduled visits always honor their booking.
const VISIT_TUNING = {
  softCap: 3,               // concurrent visitors that triggers organic-visit deferral (Phase 6)
  // How many days a retired ('done'/'deferred') visit record is kept before
  // processVisitsForDay sweeps it. getActiveVisits only ever matches the
  // current day, so anything older is inert — but the array is written into
  // the save in full on every boundary, and without a sweep it grows for the
  // life of the playthrough. A week is plenty of slack for anything that
  // wants to look back at recent visits.
  retainDoneDays: 7,
  contractor: {
    startTick: 18,          // 09:00 — Del's locked presence window (decision 10)
    endTick: 33,            // 16:30 — weekday only, see isWeekend
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
  // Meal windows in ticks (30-min units). Offered as invite targets in
  // exactly this order.
  mealSlots: [
    { id: 'breakfast', label: 'Breakfast', startTick: 16, endTick: 20 }, // 08:00-10:00
    { id: 'lunch', label: 'Lunch', startTick: 26, endTick: 30 },         // 13:00-15:00
    { id: 'dinner', label: 'Dinner', startTick: 38, endTick: 44 },       // 19:00-22:00
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
// block name would appear in no `blockFilter` in DRIVE_DEFS, so the NPC would
// sit in the room doing literally nothing for the window — which is a
// convincing description of a bug and an unconvincing one of company. Under
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
    slots: [{ id: 'evening', startTick: 38, endTick: 42 }],  // 19:00–21:00
    // Today and tomorrow. Further out than that and the player has forgotten
    // by the time the window opens.
    maxAheadDays: 2,
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
  // The handover window, in ticks. One (thirty minutes) — long enough that
  // the player can realistically be in the entry to catch the driver, but
  // not absurdly long.
  driverWindowTicks: 1,
  // How far ahead a scheduled order can be placed, in ticks past the
  // earliest possible arrival.
  maxScheduleAheadTicks: 12,
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
  startTickMin: 35,          // 17:30
  startTickMax: 40,          // 20:00
  durationTicksMin: 4,       // 2h
  durationTicksMax: 8,       // 4h
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
const VISITOR_DRIVE_ALLOWLIST = ['react_to_player', 'seek_company', 'chat_with_roommate'];

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
    tiers: [
      { tier: 'broken', label: 'Broken Stove', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'The stove doesn\'t light. No cooking until it\'s fixed.' },
      { tier: 'functional', label: 'Working Stove', qualityValue: 0.5, cost: 1500, durationDays: 5,
        desc: 'A functional gas stove. You can cook proper meals.' },
      { tier: 'upgraded', label: 'Proper Range', qualityValue: 1.0, cost: 6000, durationDays: 6,
        desc: 'A real range with oven, exhaust hood, and room for multiple pots.' },
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
  kitchen: ['kitchen_stove', 'kitchen_appliances'],
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
const FACILITY_STARTING_TIERS = {
  bedroom_habitability_player: 'functional',
  bedroom_habitability_1: 'broken',
  bedroom_habitability_2: 'broken',
  bedroom_habitability_3: 'broken',
  kitchen_stove: 'broken',
  kitchen_appliances: 'functional',
  bathroom_a_plumbing: 'broken',
  bathroom_b_plumbing: 'broken',
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
  // D11: 3 → 1.5. Tuned against measured drive throughput, not by feel: the
  // eat drive can only fire on non-transit ticks inside its blockFilter, which
  // works out to roughly one meal a day per NPC. At 2/tick a meal (which tops
  // out at NPC_INVENTORY.eatUntilHunger = 65) burned off in ~33 ticks and the
  // cast lived at an average hunger of 20.
  npcHungerDecay: 1.5,
  npcHygieneDecay: 1,       // ~1 shower/day needed at 48 ticks (D10)
  npcSocialDecay: 1,        // D12: 2 → 1
  // NPC Overhaul Phase 6 — NPC comfort + stimulation decay rates
  npcComfortDecay: 0.5,
  npcStimulationDecay: 1,
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
  // A committed dinner (inventory overhaul Phase 7, D7) survives D11's
  // removal of passive hunger restore: a 'meal' block is an NPC actually
  // sitting down at the table, which is a real act with a real commitment
  // record behind it, not background topping-up.
  npcMealRestore: 12,    // per tick while in the 'meal' block
  npcSocialRestore: 5,   // D12: 4 → 5, per tick sharing a room with another resident
  // NPC Overhaul Phase 6 — comfort + stimulation restore
  npcComfortRestore: 2,     // per tick in a comfortable room (living room with working entertainment, or an UPGRADED bedroom)
  // D14: a small unconditional floor in the living room or your own bedroom,
  // regardless of upgrade tier. The upgrade incentive is preserved (2 vs 0.5);
  // what's removed is the pre-upgrade state where comfort could only ever
  // fall, so every NPC in a starting apartment read as permanently miserable.
  // 0.5 exactly cancels npcComfortDecay, so a comfortable room HOLDS comfort
  // rather than raising it — the facility upgrade is what actually restores.
  npcComfortBaselineRestore: 0.5,
  npcComfortProximityBonus: 2, // extra comfort when sharing a room with a trusted NPC (comfort > 0.5 in castWeb)
  // D13: 4 → 2. The passive restore is deliberately smaller than the
  // seek_stimulation drive's +20, so the DRIVE is what relieves boredom and
  // the passive trickle only slows the slide. At 4/tick over the widened
  // block set the need pinned at ~84 and its drive never fired — the same
  // failure as the old hygiene ceiling, just in a different need.
  npcStimulationRestore: 2,
};

// --- Hunger rhythm (Phase 5, D1) ---
// Hunger is a rhythm, not a treadmill: the real state is hoursSinceLastMeal
// (advances with elapsed game time, scaled by NEEDS.idleDecayMultiplier) and
// mealsToday (counts meals, reset at day rollover). player.hunger stays a
// 0-100 DERIVED display value — recomputed by SIM's decayPlayerNeeds and
// whenever the player eats — so every existing reader (NEED_CONSEQUENCES,
// the LLM prompt's Hunger line, the header bars, NPC reactions) keeps
// working with no migration. The satiety mapping bottoms out at 0 exactly at
// starveHours, which is what fires the existing NEED_CONSEQUENCES.hunger
// path. The band ladder carries the mechanical effects (mood penalty, work
// penalty — see resolveMoodTarget and the work-output readers).
const HUNGER_RHYTHM = {
  satietyStart: 90,     // display satiety at hoursSinceLastMeal 0 ("just ate")
  satietyPerHour: 5,    // satiety = satietyStart - hours×perHour, floored 0 (reaches 0 at starveHours)
  starveHours: 18,      // hoursSinceLastMeal at which the NEED_CONSEQUENCES.hunger path fires
  mealsPerDayCap: 4,    // mealsToday saturates here (display/bonus hygiene)
  bands: [
    { maxHours: 4, key: 'satisfied',   label: 'Satisfied',   moodPenalty: 0 },
    { maxHours: 8, key: 'peckish',     label: 'Peckish',     moodPenalty: 0 },
    { maxHours: 12, key: 'hungry',     label: 'Hungry',      moodPenalty: -0.02 },
    { maxHours: 18, key: 'very_hungry', label: 'Very hungry', moodPenalty: -0.05 },
    // No workPenalty flag here — a hungry mood flows into work output
    // transitively via the mood bar (COMPUTER's getWorkFocus reads
    // player.mood). A separate flag would be a second, silent tuning surface.
    { maxHours: Infinity, key: 'starving', label: 'Starving', moodPenalty: -0.08 },
  ],
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
    mealsSkippedPenalty: -0.04, // evening with zero meals all day
    mealsSkippedFromHour: 18,   // clock hour at which zero meals starts to nag
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
      { type: 'buy', desc: 'Buy snacks or drinks from Nile' },
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
// A 360-day year so quarters, seasons and billing all divide cleanly.
// 4 quarters of 90 days, 4 seasons aligned 1:1 to quarters. Weekday
// numbering is unchanged (still 7-day weeks via getWeekday), so nothing
// that reads getWeekday shifts — the year is just a longer cycle layered
// on top. Days are 1-indexed throughout the codebase, so day 1 is the
// first day of spring, quarter 1, year 1.
const CALENDAR = {
  daysPerYear: 360,
  daysPerQuarter: 90,
  daysPerSeason: 90,
  // Seasons align to quarters. Order matters for getSeason below.
  seasons: ['spring', 'summer', 'autumn', 'winter'],
  seasonNames: { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' },
  // Months for formatDate — 12 months × 30 days, purely cosmetic so a
  // date reads as a real date rather than "Day 147". Each month maps to
  // a third of a quarter.
  monthsPerYear: 12,
  daysPerMonth: 30,
  monthNames: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

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
    conversation: 1 / 60, // talking to an NPC — one game-second per real second
    working: 25,        // work blocks — time flies — 1 gm / 2.4 real-sec
    sleeping: 0,        // special: skip-to-morning, not continuous
  },
  // How often the NPC sim runs (in game-minutes of accumulated time).
  // 30 = same granularity as the old tick system. This is already the
  // floor on checkpoint frequency — a separate minCheckpointAccumulation
  // knob was declared here but never read by anything, so it's gone rather
  // than sitting around implying a guard that doesn't exist.
  simCheckpointMinutes: 30,
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

// --- Transient clothing states (correctness plan Phase 4) ---
// Clothing states that describe a passing moment rather than how someone is
// dressed. They survive exactly the tick that caused them and revert to
// 'dressed' on the next one, in resolveTick's pass 2 — 'sleepwear' was
// already handled this way inline; 'towel' was supposed to be and wasn't.
// A drive sets one via `setsClothing`; nothing needs to un-set it.
const TRANSIENT_CLOTHING = ['sleepwear', 'towel'];

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
  // Social contact — real, but not defining.
  // investigate_smell (perception plan Phase 5) sits here rather than in
  // `ambient`: finding the thing that had gone off and binning it is a real
  // domestic act with a consequence, not background like doing the laundry.
  investigate_smell:   'social',
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
  guest:               'warmth',
  phone_call:          'warmth',
  npc_chat:            'warmth',
  gift:                'warmth',
  breakage:            'embarrassment',
  burnt_food:          'embarrassment',
  // The chores. `domestic` is the lowest-weight tag in EMOTIONAL_WEIGHTS (0.3)
  // for exactly this reason — it is the most common theme in the flat and the
  // least worth repeating to anyone.
  cooking:             'domestic',
  cleaning:            'domestic',
  laundry:             'domestic',
  shopping:            'domestic',
  repair:              'domestic',
  investigate_smell:   'domestic',
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
  socialCategories: ['relationship', 'romance', 'social', 'family', 'friendship', 'dating'],
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
  cap: 200,               // LRU max entries
  resolutions: { bg: '768x512', char: '512x768' },
};

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
  namePools: {
    first_f: ['Ava','Bianca','Camille','Daria','Elena','Fiona','Grace','Hana','Ivy','Jade','Kira','Lena','Mira','Nora','Olive','Priya','Quinn','Rosa','Sage','Tara','Uma','Vera','Willow','Xena','Yuki','Zara'],
    first_m: ['Aiden','Bruno','Cole','Dexter','Eli','Felix','Gus','Hugo','Ian','Jonah','Kai','Leo','Marcus','Nico','Oscar','Pierce','Quinn','Rex','Sam','Theo','Umar','Victor','Wes','Xavier','Yusuf','Zane'],
    first_n: ['Alex','Blake','Casey','Devin','Ellis','Finley','Grey','Harper','Indigo','Jordan','Kit','Lane','Max','Noel','Orien','Phoenix','Quinn','River','Sky','Taylor','Unknown','Vex','Wren','Xio','Yves','Zion'],
  },
};

// --- Canonical character schema ---
// Single authority. Every construction path returns through validateCharacter.
const CHARACTER_SCHEMA = {
  bible: {
    name:          { type: 'string', required: true, default: '', maxLength: 60 },
    visual:        { type: 'string', required: false, default: '', maxLength: 400 }, // cached paragraph derived from physical (legacy)
    genSeed:       { type: 'number', required: true, default: 0 },                  // stable seed for image gen
    age:           { type: 'number', required: true, default: 25, range: [18, 60] },   // Phase 0: first-class age field for filtering/stubs
    gender:        { type: 'string', required: true, default: 'female', enum: ['male','female','futanari','trans_male','trans_female'] }, // Phase 0: filterable identity field
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
        // clamped to ECONOMY.rent.maxRoommateShare by computeRent. Per
        // roommate because agreements are meant to vary — see
        // src/ref/complete/economy-and-rent-plan.md.
        rentShare:     { type: 'number', range: [0, 1], default: 0.15 },
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

// --- Occupation pool with schedule templates, income, stress, hours ---
const OCCUPATION_POOL = [
  { category: 'tech',       title: 'Software Developer',       scheduleTemplate: 'day_shift', incomeBand: 'high', hours: '9-17' },
  { category: 'tech',       title: 'QA Tester',                scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: '9-17' },
  { category: 'food',       title: 'Line Cook',                scheduleTemplate: 'evening_shift', incomeBand: 'low', hours: '16-23' },
  { category: 'food',       title: 'Barista',                  scheduleTemplate: 'morning_shift', incomeBand: 'low', hours: '6-14' },
  { category: 'health',     title: 'Nurse',                    scheduleTemplate: 'night_shift', incomeBand: 'mid', hours: '19-07' },
  { category: 'health',     title: 'Therapist',                 scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: '9-17' },
  { category: 'arts',       title: 'Freelance Designer',        scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible' },
  { category: 'arts',       title: 'Musician',                  scheduleTemplate: 'evening_shift', incomeBand: 'low', hours: 'flexible' },
  { category: 'service',    title: 'Retail Manager',           scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: '10-19' },
  { category: 'service',    title: 'Bartender',                 scheduleTemplate: 'night_shift', incomeBand: 'mid', hours: '18-02' },
  { category: 'education',  title: 'Teacher',                  scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: '8-16' },
  { category: 'education',  title: 'Grad Student',             scheduleTemplate: 'irregular', incomeBand: 'low', hours: 'flexible' },
  { category: 'finance',    title: 'Accountant',                scheduleTemplate: 'day_shift', incomeBand: 'high', hours: '9-17' },
  { category: 'finance',    title: 'Barista-Entrepreneur',      scheduleTemplate: 'morning_shift', incomeBand: 'low', hours: '6-14' },
  { category: 'trades',     title: 'Electrician',              scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: '7-15' },
  { category: 'trades',     title: 'Plumber',                  scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: '8-16' },
  { category: 'media',      title: 'Journalist',                scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible' },
  { category: 'media',      title: 'Podcaster',                 scheduleTemplate: 'irregular', incomeBand: 'low', hours: 'flexible' },
  { category: 'legal',      title: 'Paralegal',                 scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: '9-18' },
  { category: 'science',    title: 'Lab Researcher',            scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: '9-17' },
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
const PHYS_POOL_PIERCING_LOC = ['earlobe', 'cartilage', 'nose', 'eyebrow', 'lip', 'tongue', 'navel', 'nipple'];
const PHYS_POOL_PIERCING_TYPE = ['stud', 'ring', 'barbell', 'hoop'];
const PHYS_POOL_TATTOO_STYLE = ['tribal', 'floral', 'geometric', 'script', 'traditional', 'minimalist', 'blackwork', 'watercolor'];
const PHYS_POOL_TATTOO_LOC = ['upper arm', 'forearm', 'shoulder', 'ribcage', 'back', 'ankle', 'wrist', 'neck', 'thigh'];
const PHYS_POOL_FASHION = ['casual hoodies and jeans', 'thrifted vintage', 'minimalist monochrome', 'bright patterns', 'comfort-first athleisure', 'smart-casual', 'bohemian layers', 'streetwear', 'preppy', 'goth-adjacent', 'workwear', 'flowy dresses'];
const PHYS_POOL_VOICE_PITCH = ['deep', 'low', 'medium', 'high-pitched', 'husky'];
const PHYS_POOL_VOICE_TEXTURE = ['smooth', 'raspy', 'clear', 'gravelly', 'soft', 'sharp'];
const PHYS_POOL_VOICE_ACCENT = ['neutral American', 'Southern', 'British', 'Australian', 'Irish', 'Scottish', 'Canadian', 'New York', 'Midwestern', 'Spanish-inflected', 'French-inflected', 'slightly Southern'];
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
  cooldownTicks: 20,        // ~10 in-game hours between gift attempts
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
  minEnergyFocus: 0.4, maxEnergyFocus: 1.0,
  minMoodFocus: 0.5, maxMoodFocus: 1.0,
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
// blockFilter limits drives to specific schedule blocks.
// cooldownTicks prevents the same drive from firing again too soon.
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
//     blockAppeal: { morning: 1.2 },                     // schedule-block multiplier, default 1
//     holdTicks: 2,                                      // required — how long the pursuit is held (D4)
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
  // --- Need-driven self-care ---
  // Phase 8: the eat drive (formerly `cook`). A hungry NPC no longer
  // conjures hunger from nowhere — it searches the fridge, the pantry and
  // its own bag and REALLY consumes what it finds (your groceries
  // disappear; D8). Only when every reachable source is genuinely empty
  // does it fall back to the abstract scrounge, so nobody starves because
  // the player forgot to shop. Resolution is custom (tryEatFood in DRIVES),
  // the same dispatch shape as the peep/snoop drives — the `effects` list
  // is deliberately empty.
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
    blockFilter: ['morning', 'evening', 'wind_down', 'leisure', 'midday'],
    effects: [],
    // 8 → 14 in Phase 5, and it is a CONSEQUENCE of the cooldown rollover bug
    // fix (see isOnCooldown in drives.js), not a judgement about appetite: the
    // bug was silently suppressing 51.5% of all late-day cooldown stamps, so
    // when the wrap fix landed the raw eat rate overshot the target at ~35% of
    // all actions. The longer cooldown plus the base/block cuts below are the
    // measured compensation that brought the total back to the Phase 5 target.
    cooldownTicks: 14,
    isEatDrive: true,
    // Phase 4 (traces): the standing-signal half of this drive's footprint.
    // A kitchen meal is the NPC's cooking — dishes in the sink, grease on
    // the stove, scraps in the bin. Applied ONLY on the from-kitchen path
    // (tryEatFood, right beside the cooking-smell emission): a snack eaten
    // out of their own bag leaves nothing perceivable, exactly like a bag
    // snack emits no cooking smell. The bin's fill is what gives an untouched
    // house a rot smell to investigate within a week (the fridge's own stock
    // rots on a month's timescale, preserved ×4).
    leaves: {
      sink_kitchen: { dishes: 1 },
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
      // and holdTicks already vary meal size, and zeroing would make the drive
      // read as dead on the instrument.
      baseAppeal: 0.27,
      need: { need: 'hunger', below: 45 },
      holdTicks: 2,
      blockAppeal: { morning: 1.05, midday: 1.0, evening: 1.05, wind_down: 0.8 },
    },
  },
  shower: {
    gates: [], weight: 0.3,   // was `hygiene below 30` — now utility.need (D14)
    blockFilter: ['morning', 'wind_down', 'leisure'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'hygiene', delta: 40 } }],
    activityOverride: 'showering',
    eventTemplate: '{name} took a shower.',
    eventMood: 0.02,
    cooldownTicks: 10,
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
      holdTicks: 1,
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
    blockFilter: ['morning', 'wind_down', 'leisure', 'evening'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'hygiene', delta: 20 } }],
    activityOverride: 'washing up at the sink',
    eventTemplate: '{name} washed up as best they could.',
    eventMood: -0.01,
    cooldownTicks: 14,
    // The consolation-prize version of a shower, and it reads like one.
    expresses: { signal: 'sighing', when: { mood: { below: EXPRESSION_MOOD.low } }, intensity: SIGNALS_EMIT.sighing },
    // Deliberately worse than a shower in appeal as well as in effect, so an
    // NPC with a working bathroom prefers the shower and one without still has
    // a recovery path. Clears actionThreshold from roughly hygiene 25 down.
    utility: {
      baseAppeal: 0.20,
      need: { need: 'hygiene', below: 35 },
      temperamentWeights: { conscientiousness: 0.20 },   // as shower — see there
      holdTicks: 1,
    },
  },
  sleep_recover: {
    // The `energy below 20` gate is deleted (D14). Energy is observed to range
    // 28..100 — it never once reached 20, so this drive fired zero times in 84
    // in-game days. That is the defect D6 exists to make structurally
    // impossible, not a threshold to nudge.
    gates: [],
    weight: 0.4,
    blockFilter: ['leisure', 'wind_down'],
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
    cooldownTicks: 16,
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
      holdTicks: 3,
      blockAppeal: { wind_down: 1.2 },
    },
  },
  seek_company: {
    gates: [],   // was `social below 25` — now utility.need (D14)
    weight: 0.25,
    blockFilter: ['leisure', 'evening', 'wind_down'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'social', delta: 15 } }],
    activityOverride: 'hanging out',
    eventTemplate: '{name} came out to the common area for some company.',
    eventMood: 0.04,
    cooldownTicks: 6,
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
      holdTicks: 2,
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
    blockFilter: ['morning', 'leisure', 'wind_down'],
    effects: [],
    activityOverride: 'cleaning up',
    eventTemplate: '{name} tidied up the {room}.',
    eventMood: 0.03,
    cooldownTicks: 20,
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
      holdTicks: 2,
      blockAppeal: { morning: 1.2 },
    },
  },
  do_laundry: {
    gates: [], weight: 0.05,
    blockFilter: ['morning', 'leisure'],
    effects: [],
    activityOverride: 'doing laundry',
    eventTemplate: '{name} started a load of laundry.',
    eventMood: 0.02,
    cooldownTicks: 30,
    emptiesHamper: true,
    meters: [['laundry', 1], ['devices', 0.5]],
    emitsSignal: { signal: 'machine_running', intensity: SIGNALS_EMIT.laundry },
    // The plan's own example of the split: an NPC can hum WHILE doing
    // laundry, and cannot walk over to you while doing laundry.
    expresses: { signal: 'humming', when: { mood: { above: EXPRESSION_MOOD.high } }, intensity: SIGNALS_EMIT.humming },
    // No need and no signal drives this — laundry is a chore that simply wants
    // doing — so base appeal is the only lever and has to carry the whole
    // score. It clears actionThreshold in the morning block and not otherwise,
    // which makes laundry a morning job; the 30-tick cooldown is what keeps it
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
      holdTicks: 3,
      blockAppeal: { morning: 1.2, leisure: 0.85 },
    },
  },

  // --- Social: NPC-to-NPC interaction ---
  chat_with_roommate: {
    gates: [],   // was `social below 40` — now utility.need (D14)
    weight: 0.15,
    blockFilter: ['leisure', 'evening', 'wind_down', 'morning'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'social', delta: 20 } }],
    activityOverride: 'chatting with a roommate',
    cooldownTicks: 12,
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
      holdTicks: 2,
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
    blockFilter: ['leisure', 'evening', 'wind_down', 'morning'],
    effects: [],
    cooldownTicks: 8,
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
      holdTicks: 1,
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
    blockFilter: ['leisure', 'wind_down', 'evening', 'morning'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'comfort', delta: 15 } }],
    activityOverride: 'relaxing',
    cooldownTicks: 12,
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
      holdTicks: 3,
      blockAppeal: { wind_down: 1.15, leisure: 1.1 },
    },
  },
  seek_stimulation: {
    gates: [],   // was `stimulation below 25` — now utility.need (D14)
    weight: 0.2,
    // D15: 'afternoon' is not a block any SCHEDULES template defines — it was
    // dead weight in this filter. The real block names are sleep/morning/
    // prep/commute/work/commute_home/midday/evening/leisure/wind_down/meal.
    blockFilter: ['leisure', 'evening', 'wind_down', 'midday'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'stimulation', delta: 20 } }],
    activityOverride: 'looking for something to do',
    cooldownTicks: 10,
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
      holdTicks: 2,
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
    blockFilter: ['leisure', 'evening', 'wind_down'],
    cooldownTicks: 16,         // ~8 hours (matches NPC_PEEP_TUNING)
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
      holdTicks: 1,
    },
  },
  // BrineOS Phase 9: same isPeepDrive dispatch shape, different resolver
  // (tryNpcSnoop). Any block works — unlike peeping (which needs the
  // player in a vulnerable state at a specific moment), a phone can be
  // found any time the NPC happens to be alone with it.
  snoop_phone: {
    gates: [],
    weight: 0.0,
    blockFilter: null,
    cooldownTicks: 16,
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
      holdTicks: 1,
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
    blockFilter: ['morning', 'midday', 'evening', 'leisure', 'wind_down'],
    cooldownTicks: 6,
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
      holdTicks: 2,
    },
  },
  // Phase 8 (D8): a fond NPC hands the player something they own. Custom
  // resolution (tryGiveGift in DRIVES) — affection-gated, cooldowned, and
  // only when they actually have a non-keyItem possession worth gifting.
  // The item arrives in the player's bag via MOVE_ITEM.
  gift_to_player: {
    gates: [],
    weight: 0.0,              // actual chance computed in evaluateDrives
    blockFilter: ['leisure', 'evening', 'wind_down', 'morning'],
    cooldownTicks: NPC_GIFT_TUNING.cooldownTicks, // single source of truth
    effects: [],
    isGiftDrive: true,
    // As peep_player. Candidacy is DRIVES' giftableStack (D15) — real fondness
    // AND a non-keyItem possession worth handing over. Phase 3 adds warmth on
    // top, alone: affection is already the candidacy condition, so what is left
    // to say is whether this is a person who expresses it by handing you things.
    utility: {
      baseAppeal: 0.45,
      temperamentWeights: { warmth: 0.35 },
      holdTicks: 1,
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
  // cooldownTicks; the penalty applies between 1× and 2× it. Specified in the
  // plan as applying "within its own cooldown", which cannot happen — the
  // cooldown is a hard exclusion, so nothing inside it is ever scored. See
  // cognition.js's recencyMultiplier.
  recencyPenalty: 0.5,
  recencyWindow: 2,

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
};

// --- Overtures (npc-initiative-plan.md Phase 3, D1/D2/D5/D9/D10) -----------
// The sibling table to DRIVE_DEFS, and deliberately the same SHAPE: a drive is
// something an NPC does to the WORLD, an overture is something they direct at a
// PERSON, and both are ranked by COGNITION's one scorer on one scale (D1).
// There is no second selection system that could disagree with `npc.pursuit`
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

  // How long before the same NPC may open another one. 12 ticks is six in-game
  // hours — the same order as RUMINATION.intervalTicks, which is the cadence at
  // which the curiosity source can produce a new reason to open at all.
  cooldownTicks: 12,

  // --- Phase 4's three other channels -------------------------------------
  // Each cooldown is on the OVERTURE_DEFS entry and every one of them reads
  // from here, so "how often does this cast reach for the player" stays one
  // decision made in one place (D21).
  //
  // ALL THREE WERE RETUNED IN PHASE 6, AND TWO OF THEM WERE BROKEN (D34). A
  // cooldown stamp is a 0..47 tick index that wraps at midnight, and
  // isOnCooldown compares a WRAPPED delta — so a cooldown is not an elapsed
  // duration, it is a fixed daily clock window `cooldownTicks` wide anchored
  // at the stamp. At or above CLOCK.ticksPerDay the window is the whole day
  // and the entry is on cooldown FOREVER after its first firing; from about
  // half a day up it can land in the sleep block and never be asked again.
  // Measured: at 48 and 96 an NPC proposed and knocked exactly ONCE per game.
  // Every value here is now at or below 20, which is the largest one measured
  // to keep every entry live on every resident. See D34 — the mechanism fix
  // belongs to Plan 3's cooldown layer and is flagged, not improvised here.
  //
  // A text is the cheap channel — it costs the sender nothing and the player
  // can read it whenever — and that is exactly why it needed the retune most:
  // it is the only channel with no geometric limiter and an empty
  // do-not-disturb list (D9), so it was two thirds of every arm's volume and
  // reached a sleeping or absent player 4.5 times a day. 16 ticks is eight
  // in-game hours. Measured on 8 households x 3 residents x 7 days at
  // affection 0.9: texts 242 -> 72 and the whole cast 2.464 -> 1.405 per NPC
  // per day, with the in-person channels unmoved (approach 152 -> 144). On an
  // ABSENT player, where this is the only channel that can reach at all,
  // 1.464 -> 0.452 per NPC per day and 0 of 24 residents went silent.
  textCooldownTicks: 16,
  // A knock is the most intrusive: they walked to a door you closed. Ten
  // in-game hours, so being knocked on twice in an evening is not a thing that
  // can happen. It WANTED two days and cannot have them (D34). The rate is
  // geometry-limited rather than cooldown-limited in any case — measured 9
  // knocks at 12 ticks against 8 at 96, because the channel needs the player
  // behind a shut door and an NPC in the one adjoining room.
  knockCooldownTicks: 20,
  // A proposal books a piece of the player's future. It wanted a full day and
  // cannot have one (D34); 20 ticks is the largest working value, and the next
  // step up is where the wrap starts silencing residents outright — measured,
  // 1 of 24 residents never proposed at 20 against 4 of 24 at 24.
  proposeCooldownTicks: 20,

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
    cooldownTicks: OVERTURE.cooldownTicks,
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
    cooldownTicks: OVERTURE.textCooldownTicks,
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
    cooldownTicks: OVERTURE.proposeCooldownTicks,
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
    cooldownTicks: OVERTURE.knockCooldownTicks,
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
  // The attempt cooldown is DRIVE_DEFS.peep_player.cooldownTicks — that's
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
// Stored as npc.flags._driveCooldowns = { driveId: tickIndex }
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
