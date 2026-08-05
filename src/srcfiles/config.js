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
// bathroom, common spaces bridging them. See ref/apartment-expansion-plan.md
// for the full layout and adjacency graph.
const ROOMS = {
  // North wing — Hallway A
  bedroom_player: { name: "Your Bedroom", capacity: 2, type: 'bedroom', isPlayer: true, wing: 'north' },
  bedroom_2:      { name: "Bedroom 2", capacity: 2, type: 'bedroom', wing: 'north' },
  hallway_a:      { name: "Hallway A", capacity: 4, type: 'common', wing: 'north' },
  bathroom_a:     { name: "Bathroom A", capacity: 1, type: 'common', wing: 'north' },
  entry:          { name: "Entry", capacity: 3, type: 'common', wing: 'north' },

  // South wing — Hallway B
  bedroom_1:      { name: "Bedroom 1", capacity: 2, type: 'bedroom', wing: 'south' },
  bedroom_3:      { name: "Bedroom 3", capacity: 2, type: 'bedroom', wing: 'south' },
  hallway_b:      { name: "Hallway B", capacity: 4, type: 'common', wing: 'south' },
  bathroom_b:     { name: "Bathroom B", capacity: 1, type: 'common', wing: 'south' },

  // Center — common spaces
  living_room:    { name: "Living Room", capacity: 6, type: 'common', wing: 'center' },
  dining:         { name: "Dining Room", capacity: 6, type: 'common', wing: 'center' },
  kitchen:        { name: "Kitchen", capacity: 4, type: 'common', wing: 'center' },
  // Recreation Wing — game room → gym → pool room, chained off the living
  // room. The pool is its own space, not part of the gym: they're separate
  // but attached, and the pool is the wing's flagship restoration.
  game_room:      { name: "Game Room", capacity: 4, type: 'common', wing: 'east' },
  gym:            { name: "Gym", capacity: 2, type: 'common', wing: 'east' },
  pool_room:      { name: "Pool Room", capacity: 4, type: 'common', wing: 'east' },
  study:          { name: "Study", capacity: 2, type: 'common', wing: 'west' },
  balcony:        { name: "Balcony", capacity: 3, type: 'common', wing: 'west' },
  laundry:        { name: "Laundry Room", capacity: 2, type: 'common', wing: 'west' },
};

const COMMON_ROOMS = Object.keys(ROOMS).filter(id => ROOMS[id].type === 'common');
const ALL_ROOMS = Object.keys(ROOMS);

// --- Room adjacency (The Mirrored H floor plan) ---
// First-class CONFIG constant — the authoritative spatial graph. Promoted
// from drives.js where it was only used for peep checks. isRoomAdjacent
// (drives.js) and the floor plan visual both read this.
// Symmetric: if A→B, B→A. Self-adjacency (A→A) is not listed.
const ROOM_ADJACENCY = {
  hallway_a:   ['bedroom_player', 'bedroom_2', 'bathroom_a', 'living_room'],
  hallway_b:   ['bedroom_1', 'bedroom_3', 'bathroom_b', 'kitchen'],
  entry:       ['living_room'],
  living_room: ['entry', 'dining', 'game_room', 'study', 'balcony', 'hallway_a'],
  dining:      ['living_room', 'kitchen'],
  kitchen:     ['dining', 'laundry', 'hallway_b'],
  game_room:   ['living_room', 'gym'],
  gym:         ['game_room', 'pool_room'],
  pool_room:   ['gym'],
  study:       ['living_room'],
  balcony:     ['living_room'],
  laundry:     ['kitchen'],
  bathroom_a:  ['hallway_a'],
  bathroom_b:  ['hallway_b'],
  bedroom_player: ['hallway_a'],
  bedroom_1:   ['hallway_b'],
  bedroom_2:   ['hallway_a'],
  bedroom_3:   ['hallway_b'],
};

// --- Floor plan coordinates (schematic, in SVG viewBox units) ---
// Each room gets {x, y, w, h} for the floor plan visual (Phase 2).
// Arranged to mirror the Mirrored H layout — north wing at top, south at
// bottom, common spaces in the center column.
const ROOM_LAYOUT = {
  bedroom_player: { x: 0,   y: 0,   w: 50, h: 35 },
  hallway_a:      { x: 55,  y: 5,   w: 50, h: 25 },
  bedroom_2:      { x: 110, y: 0,   w: 50, h: 35 },
  bathroom_a:     { x: 60,  y: 35,  w: 40, h: 20 },
  entry:          { x: 0,   y: 60,  w: 40, h: 25 },
  living_room:    { x: 45,  y: 60,  w: 50, h: 35 },
  game_room:      { x: 100, y: 60,  w: 35, h: 20 },
  gym:            { x: 100, y: 85,  w: 35, h: 20 },
  // Sits below the gym and clear of laundry (x 85-115, y 125-145) — the
  // only rectangle it could otherwise have collided with.
  pool_room:      { x: 120, y: 110, w: 40, h: 28 },
  study:          { x: 0,   y: 90,  w: 35, h: 25 },
  balcony:        { x: 75,  y: 100, w: 30, h: 15 },
  dining:         { x: 40,  y: 100, w: 30, h: 15 },
  kitchen:        { x: 30,  y: 120, w: 50, h: 25 },
  laundry:        { x: 85,  y: 125, w: 30, h: 20 },
  hallway_b:      { x: 50,  y: 150, w: 50, h: 25 },
  bathroom_b:     { x: 0,   y: 155, w: 40, h: 20 },
  bedroom_1:      { x: 0,   y: 180, w: 50, h: 35 },
  bedroom_3:      { x: 110, y: 180, w: 50, h: 35 },
};

// --- Economy (luxury penthouse scale — see apartment-expansion-plan.md) ---
// --- Economy ---
// The rent model is the game's main pressure system, and it is
// deliberately NOT an even split. The player holds the lease: they owe the
// whole rent, and each roommate offsets at most a capped fraction of the
// total. So the numbers push toward the social sim rather than away from
// it — see ref/economy-and-rent-plan.md for the full design.
//
// That cap is not fixed: it scales with how good the apartment is. Nobody
// pays penthouse rates for a wreck, and a fully restored place with every
// amenity working can command real money. This is what makes the upgrade
// system an investment rather than a drain (ref/apartment-upgrades-plan.md).
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
  rentLatePenaltyMood: 0.1,  // player mood lost per day rent stays unpaid (mood is [-1,1])
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
// via `split:'lease'` — see ref/economy-and-rent-plan.md. The grace
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
// ref/economy-and-rent-plan.md §Quarterly estimated taxes.
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
// See ref/economy-and-rent-plan.md §Utilities.
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
// facility reaches at least 'functional'. See ref/apartment-upgrades-plan.md.
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
// room-sharing plan — see ref/renovation-occupancy-overhaul-plan.md.
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
    'cook': ['kitchen_stove'],
    // NPCs who watch TV or play games degrade the living room / game room.
    // There's no dedicated 'game' drive; leisure-time use of these rooms
    // is covered by the 'seek_company' drive when it fires while an NPC
    // is in the living_room or game_room. We decay both facilities on
    // seek_company to approximate shared-area wear.
    'seek_company': ['living_room_entertainment', 'game_room_setup'],
  },
};

// --- Renovation jobs (ref/renovation-occupancy-overhaul-plan.md) ---
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

// --- Contractor Friend (ref/contractor-tutorial-overhaul-plan.md) ---
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
    typicalAttire: { casual: 'flannel and work boots', work: 'coveralls', sleep: 't-shirt and sweatpants', formal: 'a clean button-down he clearly hates' },
    voice: { pitch: 'low', texture: 'gravelly', accent: 'working-class' },
    gait: 'deliberate, heavy-footed',
    scent: 'sawdust and coffee',
    genitals: '',
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
  occupation: { category: 'service', title: 'General Contractor', scheduleTemplate: 'irregular', incomeBand: 'high', stressProfile: 0.3, hours: 'flexible' },
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

// --- Contractor tutorial (ref/contractor-tutorial-overhaul-plan.md, Phase 3) ---
// The first job on an auxiliary bedroom is free — the one-time guided
// tutorial that doubles as the opening's "you inherited this" framing
// (ref/game-opening-plan.md). Only the three NON-player bedrooms qualify:
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

// --- Visit spine (ref/external-world-npcs-overhaul-plan.md, Phase 1) ---
// world.visits[] is the single source of truth for "who is onsite and why",
// written by every source (renovation jobs today; maid contracts, food
// orders, roommates' friends, player invitations in later phases) and read
// by one question: SIM's getActiveVisits. Ticks are 0-47 half-hour
// increments (getTickIndex, matching SCHEDULES). The soft cap applies to
// ORGANIC visits only — paid/scheduled visits always honor their booking.
const VISIT_TUNING = {
  softCap: 3,               // concurrent visitors that triggers organic-visit deferral (Phase 6)
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
    default: ['visiting', 'hanging around'],
  },
};

// Weekend rush (ref/external-world-npcs-overhaul-plan.md, Phase 4). Del's
// crew works weekdays only, so a job's durationDays are WORKING days and a
// booking made late in the week stretches across the weekend. Paying the
// rush premium keeps them working through it, turning durationDays back
// into plain calendar days — money bought back time, which is the trade
// the whole economy is built on.
const RENOVATION_RUSH_MULTIPLIER = 1.6;

// --- The maid (ref/external-world-npcs-overhaul-plan.md, Phase 3) ---
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
  // --- Pool room: liner, filtration, pump ---
  // The wing's flagship renovation and the single most expensive thing in
  // the apartment. A pool room is only a pool room in name until the water
  // system actually runs — until then it's a dry concrete hole with a
  // torn liner, which is exactly the kind of inherited-wreck detail the
  // opening is built on. Highest qualityWeight of any facility: nothing
  // else moves what a room commands like a working pool.
  pool_systems: {
    id: 'pool_systems', label: 'Pool Systems', room: 'pool_room',
    qualityWeight: 5, gatesActions: ['self.swim'],
    appeal: { 'fitness': 2.0, 'yoga': 1.0, 'hiking': 0.5, '*': 1.2 },
    tiers: [
      { tier: 'broken', label: 'Derelict Pool', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'Torn liner, seized pump, filters full of ten-year-old leaves. It holds no water.' },
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
// in disrepair — see ref/game-opening-plan.md. The player's own bedroom
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
const NEEDS = {
  // sleepRestore moved to the SLEEP block — energy recovered by sleeping is
  // now a function of hours actually slept, not a flat per-tick rate.
  energy:  { decayPerTick: 2,  max: 100, warnBelow: 20, workCost: 8 },
  hunger:  { decayPerTick: 3,  max: 100, warnBelow: 20, eatRestore: 40 },
  hygiene: { decayPerTick: 1,  max: 100, warnBelow: 25, washRestore: 60 },
  // Player mood lives on the same [-1, 1] scale as NPC mood (relPlayer
  // axes, castWeb axes, moodDelta application all assume -1..1) — it was
  // previously stored 0-100 while moodLabel() and every LLM prompt read it
  // expecting -1..1, so player mood always read as "good" regardless of
  // its actual value. decayPerTick/warnBelow below are the old 0-100
  // figures (1, 20) rescaled by *(2/100) to preserve the same felt rate.
  mood:    { decayPerTick: 0.02, max: 1, warnBelow: -0.6 },
  // NPC Overhaul Phase 6 — comfort + stimulation needs
  comfort:    { decayPerTick: 0.5, max: 100, warnBelow: 20, warnAbove: 80 },
  stimulation: { decayPerTick: 1,   max: 100, warnBelow: 20, warnAbove: 80 },
  npcEnergyDecay: 2,
  npcHungerDecay: 3,
  npcHygieneDecay: 1,
  npcSocialDecay: 2,
  // NPC Overhaul Phase 6 — NPC comfort + stimulation decay rates
  npcComfortDecay: 0.5,
  npcStimulationDecay: 1,
  npcSocialMax: 100, // hunger/hygiene/energy each carry their own .max above; social has no player-facing counterpart, so its max lives here
  // NPC need restoration per tick, keyed to schedule block rather than
  // parsing activity strings (activity labels are flavor text, not a
  // structured need signal). Without these, NPC needs only ever decayed —
  // written but never read back into consequence.
  npcSleepRestore: 6,    // per tick while in the 'sleep' block
  npcEatRestore: 8,      // per tick during 'morning'/'evening' blocks
  npcHygieneRestore: 8,  // per tick during 'morning'/'wind_down' blocks
  npcSocialRestore: 4,   // per tick when sharing a common room with another resident
  // NPC Overhaul Phase 6 — comfort + stimulation restore
  npcComfortRestore: 3,     // per tick when in a comfortable room (living room with entertainment tier >= 1, bedroom with upgraded bed)
  npcComfortProximityBonus: 2, // extra comfort when sharing a room with a trusted NPC (comfort > 0.5 in castWeb)
  npcStimulationRestore: 4,   // per tick during leisure/entertainment activities
};

// --- Need consequences (P7 gameplay loops). When a need hits 0, real
// mechanical effects fire — not just a red bar. These are checked every
// tick in decayPlayerNeeds (SIM) and applied through the same applyEffects
// pipeline as everything else. ---
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
// ref/sleep-and-alarm-plan.md.
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
  // Game-minutes per real-second at each context scale
  scales: {
    idle: 20,           // standing around, menu navigation
    browsing: 10,       // computer browser, AfterHours grid
    masturbating: 3,    // slow, intimate — time crawls
    conversation: 1,    // talking to an NPC — real-time
    working: 25,        // work blocks — time flies
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
// The phone's obligation tracker (see ref/BrineOS-The-Phone-plan.md §Phase
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
        typicalAttire:        { type: 'object', default: {},
          fields: { casual: { type: 'string', default: '' }, work: { type: 'string', default: '' }, sleep: { type: 'string', default: '' }, formal: { type: 'string', default: '' } } },
        voice:                { type: 'object', default: {},
          fields: { pitch: { type: 'string', default: '' }, texture: { type: 'string', default: '' }, accent: { type: 'string', default: '' } } },
        gait:                 { type: 'string', default: '' },
        scent:                { type: 'string', default: '' },
        genitals:             { type: 'string', default: '' }, // gated by contentConfig.mature
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
        stressProfile:    { type: 'number', range: [0, 1] },
        hours:            { type: 'string', required: true },
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
        vocabularyLevel: { type: 'number', range: [0, 1], default: 0.5 },  // NPC Overhaul
        catchphrases:   { type: 'array', default: [] },                   // NPC Overhaul
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
        // ref/economy-and-rent-plan.md.
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
          itemFields: { text: { type: 'string' }, day: { type: 'number' }, importance: { type: 'number' }, category: { type: 'string', default: 'other' }, valid: { type: 'boolean', default: true } } },
        episodes: { type: 'array', default: [],
          itemFields: { day: { type: 'number' }, text: { type: 'string' }, decay: { type: 'number', range: [0, 1] }, importance: { type: 'number' }, emotionalTag: { type: 'string', default: '' }, participants: { type: 'array', default: [] } } },
        summary:  { type: 'string', default: '' },
        summaryRevision: { type: 'number', default: 0 },                    // NPC Overhaul
        recent:  { type: 'array', default: [] },                            // NPC Overhaul — last ~10 exchanges
        styleCounters: { type: 'object', default: {},                       // NPC Overhaul — anti-repetition
          fields: { total: { type: 'number', default: 0 }, sincePersonal: { type: 'number', default: 0 }, recentTopics: { type: 'array', default: [] }, lastJobMention: { type: 'number', default: -1 }, lastHobbyMention: { type: 'number', default: -1 } } },
      }
    },
    arcs:           { type: 'array', default: [] },
    // Contacts (external-world plan Phase 2): do you have this person's
    // number? Gates the IM contact list and invitations. Earned by asking
    // in conversation — hiring someone through a service never grants it.
    // Del is the sole day-one exception (seeded true at new-game setup).
    contactKnown:   { type: 'boolean', default: false },
    flags:           { type: 'object', default: {} },
  }
};

// --- Contacts (ref/external-world-npcs-overhaul-plan.md, Phase 2) ---
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
  { category: 'tech',       title: 'Software Developer',       scheduleTemplate: 'day_shift', incomeBand: 'high', stressProfile: 0.4, hours: '9-17' },
  { category: 'tech',       title: 'QA Tester',                scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.5, hours: '9-17' },
  { category: 'food',       title: 'Line Cook',                scheduleTemplate: 'evening_shift', incomeBand: 'low', stressProfile: 0.7, hours: '16-23' },
  { category: 'food',       title: 'Barista',                  scheduleTemplate: 'morning_shift', incomeBand: 'low', stressProfile: 0.3, hours: '6-14' },
  { category: 'health',     title: 'Nurse',                    scheduleTemplate: 'night_shift', incomeBand: 'mid', stressProfile: 0.8, hours: '19-07' },
  { category: 'health',     title: 'Therapist',                 scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.5, hours: '9-17' },
  { category: 'arts',       title: 'Freelance Designer',        scheduleTemplate: 'irregular', incomeBand: 'mid', stressProfile: 0.4, hours: 'flexible' },
  { category: 'arts',       title: 'Musician',                  scheduleTemplate: 'evening_shift', incomeBand: 'low', stressProfile: 0.6, hours: 'flexible' },
  { category: 'service',    title: 'Retail Manager',           scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.6, hours: '10-19' },
  { category: 'service',    title: 'Bartender',                 scheduleTemplate: 'night_shift', incomeBand: 'mid', stressProfile: 0.7, hours: '18-02' },
  { category: 'education',  title: 'Teacher',                  scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.6, hours: '8-16' },
  { category: 'education',  title: 'Grad Student',             scheduleTemplate: 'irregular', incomeBand: 'low', stressProfile: 0.8, hours: 'flexible' },
  { category: 'finance',    title: 'Accountant',                scheduleTemplate: 'day_shift', incomeBand: 'high', stressProfile: 0.5, hours: '9-17' },
  { category: 'finance',    title: 'Barista-Entrepreneur',      scheduleTemplate: 'morning_shift', incomeBand: 'low', stressProfile: 0.7, hours: '6-14' },
  { category: 'trades',     title: 'Electrician',              scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.4, hours: '7-15' },
  { category: 'trades',     title: 'Plumber',                  scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.5, hours: '8-16' },
  { category: 'media',      title: 'Journalist',                scheduleTemplate: 'irregular', incomeBand: 'mid', stressProfile: 0.6, hours: 'flexible' },
  { category: 'media',      title: 'Podcaster',                 scheduleTemplate: 'irregular', incomeBand: 'low', stressProfile: 0.4, hours: 'flexible' },
  { category: 'legal',      title: 'Paralegal',                 scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.7, hours: '9-18' },
  { category: 'science',    title: 'Lab Researcher',            scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.5, hours: '9-17' },
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

// --- Room cleanliness, once WORLD derives it from object state instead of
// the old fixed initial value. baseline is used only when a room has no
// cleanliness-relevant objects (weight 0 across the board). ---
const CLEANLINESS = { baseline: 50 };

// --- Small numeric tuning for the registered apartment actions (ACTIONS/
// DEFS.ACTIONS), pulled out of doCook/doWatchTV/doRelax's old inline
// literals so nothing magic lives in the action bodies. ---
const ACTION_TUNING = {
  cookExtraHungerRestore: 10, // cooking restores hunger.eatRestore + this
  tvMoodGain: 0.1,
  relaxMoodGain: 0.16,
  relaxEnergyGain: 5,
  dishesMoodGain: 0.05,
  // Phase 5: new room actions
  workoutMoodGain: 0.12,
  workoutEnergyCost: 10,
  workoutHygieneCost: 8,
  gamesMoodGain: 0.1,
  gamesEnergyCost: 3,
  // Swimming is the gym's opposite number: similar effort, but you come
  // out cleaner rather than needing a shower afterward.
  swimMoodGain: 0.18,
  swimEnergyCost: 9,
  swimHygieneGain: 10,
  studyMoodGain: 0.08,
  laundryMoodGain: 0.03,
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
const MASTURBATION = {
  timeCostMinutes: 15,
  warmupSeconds: 3,
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
const DRIVE_DEFS = {
  // --- Need-driven self-care ---
  cook: {
    gates: [{ need: 'hunger', op: 'below', threshold: 25 }], weight: 0.3,
    blockFilter: ['morning', 'evening', 'leisure', 'midday'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'hunger', delta: 30 } }],
    activityOverride: 'cooking',
    eventTemplate: '{name} made themselves something to eat.',
    eventMood: 0.03,
    cooldownTicks: 8,
    meters: [['cooking', 1], ['devices', 0.5]],
  },
  shower: {
    gates: [{ need: 'hygiene', op: 'below', threshold: 30 }], weight: 0.3,
    blockFilter: ['morning', 'wind_down', 'leisure'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'hygiene', delta: 40 } }],
    activityOverride: 'showering',
    eventTemplate: '{name} took a shower.',
    eventMood: 0.02,
    cooldownTicks: 10,
    // Showering makes the NPC undressed during the activity — see clothing state
    setsClothing: 'towel',
    restoresClothing: true,
    meters: [['showers', 1], ['waterHeating', 1]],
  },
  sleep_recover: {
    gates: [{ need: 'energy', op: 'below', threshold: 20 }],
    weight: 0.4,
    blockFilter: ['leisure', 'wind_down'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'energy', delta: 25 } }],
    activityOverride: 'napping',
    eventTemplate: '{name} crashed for a nap.',
    eventMood: 0.05,
    cooldownTicks: 16,
  },
  seek_company: {
    gates: [{ need: 'social', op: 'below', threshold: 25 }],
    weight: 0.25,
    blockFilter: ['leisure', 'evening', 'wind_down'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'social', delta: 15 } }],
    activityOverride: 'hanging out',
    eventTemplate: '{name} came out to the common area for some company.',
    eventMood: 0.04,
    cooldownTicks: 6,
    moveToCommon: true,
  },

  // --- Chore behavior ---
  clean_common: {
    gates: [],
    weight: 0.08,
    blockFilter: ['morning', 'leisure', 'wind_down'],
    effects: [],
    activityOverride: 'cleaning up',
    eventTemplate: '{name} tidied up the {room}.',
    eventMood: 0.03,
    cooldownTicks: 20,
    cleansRoom: true,
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
  },

  // --- Social: NPC-to-NPC interaction ---
  chat_with_roommate: {
    gates: [{ need: 'social', op: 'below', threshold: 40 }],
    weight: 0.15,
    blockFilter: ['leisure', 'evening', 'wind_down', 'morning'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'social', delta: 20 } }],
    activityOverride: 'chatting with a roommate',
    cooldownTicks: 12,
    npcToNpc: true,
    // Produces a small rel delta between the two NPCs
    relDelta: { trust: 0.02, affection: 0.02 },
  },

  // --- Social: NPC-to-player IM ---
  text_player: {
    gates: [],
    weight: 0.04,
    blockFilter: ['leisure', 'evening', 'wind_down', 'work'],
    effects: [],
    cooldownTicks: 24,
    sendsIm: true,
    // IM text templates — picked at random, filled with NPC name
    imTemplates: [
      'hey, you around?',
      'can you grab milk on your way back?',
      'the wifi is being weird again',
      'someone left dishes in the sink again 🙄',
      'you good?',
      'movie night tonight?',
      'i made extra food if you want some',
    ],
  },

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
  },

  // NPC Overhaul Phase 6 — comfort + stimulation drives
  seek_comfort: {
    gates: [{ need: 'comfort', op: 'below', threshold: 25 }],
    weight: 0.2,
    blockFilter: ['leisure', 'wind_down', 'evening', 'morning'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'comfort', delta: 15 } }],
    activityOverride: 'relaxing',
    cooldownTicks: 12,
    moveToComfort: true,
    eventTemplate: '{name} settles into the couch, looking comfortable.',
    eventMood: 0.03,
  },
  seek_stimulation: {
    gates: [{ need: 'stimulation', op: 'below', threshold: 25 }],
    weight: 0.2,
    blockFilter: ['leisure', 'evening', 'afternoon', 'midday'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'stimulation', delta: 20 } }],
    activityOverride: 'looking for something to do',
    cooldownTicks: 10,
    eventTemplate: '{name} seems restless, looking for something to occupy themselves.',
    eventMood: -0.02,
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

// ===== /SECTION: CONFIG =====
