// ===== SECTION: DEFS.COMPUTER =====
// App registry and per-app content data. A new app is an APP_DEFS entry +
// a data source + (ideally) zero new render code — see RENDER.COMPUTER's
// small set of generic renderers (dashboard/catalog/list/article), which
// every app's screens are declared against rather than each app writing
// its own DOM code.
//
// 'work', 'shop', and 'browser' exist so far — classes/services/
// classifieds/im/stream land in later passes, each adding one APP_DEFS
// entry and whatever data source it needs, following this same shape.
//
// Every entry carries a `devices` list (BrineOS Phase 5 app parity) saying
// which devices host it: 'computer' for the desktop shell (desktop icons,
// taskbar, start menu) and 'phone' for the BrineOS home grid. Both lists
// currently coincide — full parity — because the phone renders every
// shared app's screens through the exact same COMPUTER_RENDERERS, and the
// Tracker's deep links navigate to apps like work/im/upgrades that the
// phone must be able to open. render.phone.js derives the home grid from
// this field; phone.js's phoneOpenApp refuses apps that don't list 'phone'.

const APP_DEFS = {
  work: {
    id: 'work', label: 'WorkHub', category: 'productivity', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'board',
    screens: {
      board: { label: 'Gig Board', renderer: 'gigboard', source: 'state:apps.gigs.board' },
      accepted: { label: 'My Gigs', renderer: 'gigaccepted' },
    },
  },
  // "Nile" — an unsubtle Amazon knockoff. Everything ships next-day
  // regardless of what it is, to the hallway doormat, and someone else in
  // the apartment could get to it before you do (COMPUTER's checkoutCart
  // + UI's processDeliveriesForDay, which SPAWN_ITEMs onto the doormat
  // rather than teleporting straight into your inventory).
  shop: {
    id: 'shop', label: 'Nile', category: 'shopping', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'browse',
    screens: {
      browse: { label: 'Browse', renderer: 'nile', source: 'SHOP_CATALOG_LIST', rowAction: 'shop.add-to-cart', rowActionLabel: 'Add to Cart' },
      cart: {
        label: 'Cart', renderer: 'list', source: 'state:apps.shop.cart', emptyText: 'Your cart is empty.',
        labelFn: (row) => `${ITEM_DEFS[row.defId]?.label || row.defId} × ${row.units} — $${(ITEM_DEFS[row.defId]?.price || 0) * row.units}`,
        rowAction: 'shop.remove-from-cart', rowActionLabel: 'Remove',
        footerAction: 'shop.checkout', footerActionLabel: 'Checkout',
      },
    },
  },
  browser: {
    id: 'browser', label: 'Browser', category: 'web', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'home',
    screens: {
      home: { label: 'Home', renderer: 'browser', source: 'SITE_DEFS_LIST', rowAction: 'browser.visit', rowActionLabel: 'Visit' },
      site: { label: 'Page', renderer: 'article', hideFromNav: true },
    },
  },
  // Paid, multi-lesson courses — distinct from Browser's free one-off
  // tutorial sites. A course is a real commitment: money up front, several
  // timed lessons to actually finish it.
  classes: {
    id: 'classes', label: 'EduStream', category: 'education', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'catalog',
    screens: {
      catalog: { label: 'Catalog', renderer: 'edustream-catalog' },
      enrolled: { label: 'My Courses', renderer: 'edustream-enrolled' },
    },
  },
  // Hired help — a recurring subscription, not a one-off purchase. See
  // COMPUTER's processServiceVisitsForDay: a hired service visits on its
  // own cadence via day rollover, not something the player has to click
  // each time.
  services: {
    id: 'services', label: 'HomeCare', category: 'services', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'catalog',
    screens: {
      catalog: { label: 'Available', renderer: 'homecare-catalog' },
      hired: { label: 'Hired', renderer: 'homecare-hired' },
    },
  },
  // Roommate-wanted ads (RoomList). Phase 1 upgrade: the browse grid now
  // shows 30 cheap deterministic stubs per day (generated at day rollover
  // — no LLM). Full NPCs are created on-demand when the player loads a
  // profile (Phase 3 fetch queue). The 'post' screen is your listing; the
  // 'browse' screen is the applicant pool; 'detail' is a single profile
  // (reuses renderApplicantProfile for full NPCs; stubs show a preview
  // card with a "Load Full Profile" button).
  classifieds: {
    id: 'classifieds', label: 'RoomList', category: 'classifieds', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'browse',
    screens: {
      post: { label: 'My Listing', renderer: 'roomlist-post' },
      browse: { label: 'Browse', renderer: 'roomlist-browse' },
      queue: { label: 'Inbox', renderer: 'roomlist-queue', hideFromNav: false },
      studio: { label: 'Studio', renderer: 'roomlist-studio' },
      applicants: { label: 'Applicants', renderer: 'roomlist-applicants', hideFromNav: true },
      detail: { label: 'Profile', renderer: 'applicant', hideFromNav: true },
      assign: { label: 'Assign Room', renderer: 'roomlist-assign', hideFromNav: true },
    },
  },
  // Real conversations with residents, through the exact same LLM
  // proposal contract doTalk/doPlayerAction already use — a reply can
  // move relPlayer, land a memory fact, everything a scene conversation
  // can do. NPC-initiated texts (a pendingIntent an autonomy drive sets)
  // aren't wired yet since autonomy (P7) doesn't exist; threads are
  // player-initiated only for now. A single always-both-panes screen
  // (renderMessages, RENDER.COMPUTER) rather than separate thread-list/
  // open-thread screens — selecting a contact just changes which
  // conversation the right-hand pane shows.
  im: {
    id: 'im', label: 'Messages', category: 'social', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'threads',
    screens: {
      threads: { label: 'Messages', renderer: 'messenger' },
    },
  },
  // The simplest app: one screen, watching costs time and lifts mood, no
  // sub-navigation needed. Rounds out P4 by reusing `catalog` with zero
  // new render code at all — not even a `.cost` fallback, since shows are
  // free to watch (the price column just renders empty).
  stream: {
    id: 'stream', label: 'Streamly', category: 'entertainment', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'browse',
    screens: {
      browse: { label: 'Browse', renderer: 'streamly', source: 'STREAM_DEFS_LIST', rowAction: 'stream.watch', rowActionLabel: 'Watch Episode' },
    },
  },
  // Brine Bank — merge of the old Bills + Portfolia apps (BrineOS Phase 1).
  // One finance app: an Overview screen (the whole money picture at a
  // glance), plus the bills dashboard and the investing screens reused
  // unchanged. Shared account data stays where it always lived — world.bills
  // for the bills, computer.apps.invest for holdings — so the reused
  // renderers and do* handlers work unmodified (decision A of
  // ref/BrineOS-The-Phone-plan.md). Old saves with open bills/invest
  // windows are handled by normalizeComputerState's unknown-appId prune.
  bank: {
    id: 'bank', label: 'Brine Bank', category: 'finance', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'overview',
    screens: {
      overview: { label: 'Overview', renderer: 'bank-overview' },
      bills: { label: 'Bills', renderer: 'bills-dashboard' },
      invest: { label: 'Portfolia', renderer: 'invest-dashboard' },
    },
  },
  // Phase 4 upgrades: the apartment disrepair/renovation screen. Shows
  // every facility grouped by room, its current tier, the cost to upgrade,
  // and a quality summary. Purchasing advances the tier, which raises
  // apartment quality and the rent ceiling — the money sink that pays
  // back. See ref/apartment-upgrades-plan.md.
  upgrades: {
    id: 'upgrades', label: 'RenoFix', category: 'home', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'dashboard',
    screens: {
      dashboard: { label: 'Apartment', renderer: 'upgrades-dashboard' },
    },
  },
  // Phase 11 investing now lives inside Brine Bank as its Portfolia screen
  // (see the bank app above); the holdings data stayed in computer.apps
  // .invest so invest-dashboard and the invest handlers work unmodified.
};

// --- Jobs: what WorkHub's board offers, and what working a block pays.
// `qualitySkill` (optional) is read through SKILLS' payMultiplier curve —
// getting better at the relevant skill raises pay on top of the base
// rate. `requiredSkills` gates applying, not working once hired. ---
// --- Gig board (Phase 2 — vocation rewrite) ---
// Replaces JOB_DEFS. The player is a freelancer: accept discrete gigs,
// work them block-by-block, deliver by a deadline. Income is lumpy by
// design — dry spells happen. See ref/vocation-and-gigs-plan.md.
//
// A template is the *shape* of an available gig; instances are generated
// seeded on day rollover (generateGigsForDay) with payout/blocks/deadline
// rolled within the template's ranges and scaled by reputation tier.
const GIG_TEMPLATES = {
  data_entry: {
    id: 'data_entry', label: 'Data Entry Batch', category: 'admin',
    skill: 'tech', minSkill: 0,
    blocksRange: [3, 8], deadlineRange: [3, 7], basePayoutPerBlock: 24,
    clientPool: ['Meridian Logistics', 'Crestline Retail', 'Harbor Data Co', 'Pinebrook Clinic'],
  },
  web_tweak: {
    id: 'web_tweak', label: 'Website Tweak', category: 'web',
    skill: 'tech', minSkill: 2,
    blocksRange: [4, 10], deadlineRange: [3, 8], basePayoutPerBlock: 40,
    clientPool: ['Lumen Studio', 'Northgate Bakery', 'Field & Fern Co', 'Sablewood Designs'],
  },
  copy_edit: {
    id: 'copy_edit', label: 'Copy Edit Pass', category: 'writing',
    skill: 'tech', minSkill: 1,
    blocksRange: [3, 9], deadlineRange: [3, 9], basePayoutPerBlock: 34,
    clientPool: ['Quill & Page', 'Lighthouse Press', 'Marlow Books', 'Saltmarsh Media'],
  },
  script_automation: {
    id: 'script_automation', label: 'Automation Script', category: 'dev',
    skill: 'tech', minSkill: 3,
    blocksRange: [6, 14], deadlineRange: [4, 9], basePayoutPerBlock: 72,
    clientPool: ['Vantage Analytics', 'GreenlineOps', 'Cobalt Systems', 'Tidepool HR'],
  },
  app_feature: {
    id: 'app_feature', label: 'App Feature Build', category: 'dev',
    skill: 'tech', minSkill: 4,
    blocksRange: [10, 20], deadlineRange: [5, 10], basePayoutPerBlock: 120,
    clientPool: ['Bramble Inc', 'Hollowpoint Games', 'Cedar & Co', 'Northstar Apps'],
  },
  infra_project: {
    id: 'infra_project', label: 'Infrastructure Project', category: 'dev',
    skill: 'tech', minSkill: 5,
    blocksRange: [14, 30], deadlineRange: [6, 10], basePayoutPerBlock: 175,
    clientPool: ['Mesa Cloud', 'Atlas Platform', 'Ironroot Labs', 'Verge Distribution'],
  },
};

// Reputation tiers gate which gigs appear and how well they pay. Rep is
// 0-100. A gig's tier is the lowest tier whose floor the player's rep
// meets; payout scales within the tier toward its ceiling as rep rises.
const GIG_REPUTATION_TIERS = [
  { name: 'Novice',      floor: 0,  payMult: [1.00, 1.10], boardSize: [3, 4] },
  { name: 'Competent',   floor: 20, payMult: [1.30, 1.55], boardSize: [4, 5] },
  { name: 'Established', floor: 40, payMult: [1.80, 2.30], boardSize: [5, 6] },
  { name: 'Specialist',  floor: 65, payMult: [2.80, 3.50], boardSize: [5, 7] },
  { name: 'Elite',       floor: 85, payMult: [4.00, 5.00], boardSize: [6, 8] },
];

// Per-block energy cost of gig work. Smaller than the old per-job figure;
// gigs pay lump sums on delivery, so each block is progress, not a wage.
const GIG_ENERGY_PER_BLOCK = 6;
// Max concurrent gigs — the deadline pressure does the limiting.
const GIG_MAX_CONCURRENT = 3;
// Reputation movement. Delivery on time scales up by how close to the
// deadline; a miss scales down by how late. Abandoning is worse.
const GIG_REP_DELIVERY = 3;     // base rep gain per delivered gig
const GIG_REP_MISS = -8;        // per missed-deadline gig
const GIG_REP_ABANDON = -15;    // per abandoned gig
const GIG_REP_MAX = 100;

// --- Browser: a handful of authored sites, not (yet) LLM-generated
// content — deferred rather than faked; see ARCHITECTURE.md's P4 Browser
// notes for the kv.gen/generateAndCache design this will grow into.
// `requiresContentFlag` gates a site behind CONTENT_CONFIG's flags (the
// same mechanism the tone/content prompt wiring from P0 reads) — the
// adult site is data, not a special case in the browser's code. `effects`
// are applied on visit (COMPUTER's visitSite/UI.COMPUTER's doBrowserVisit)
// through the same trusted-producer applyEffects path ACTIONS uses.
const SITE_DEFS = {
  daily_byte: {
    id: 'daily_byte', label: 'The Daily Byte', url: 'dailybyte.example', category: 'news',
    body: "Local headlines: a zoning dispute drags into its third public meeting, a raccoon loose downtown has its own hashtag now, and the weather desk is once again fairly sure it will rain on Saturday.",
  },
  chefs_corner: {
    id: 'chefs_corner', label: "Chef's Corner", url: 'chefscorner.example', category: 'tutorial',
    body: "This week: a step-by-step knife-skills primer — how to actually dice an onion without losing a fingertip, and why your knife is probably duller than you think.",
    effects: ['ADD_SKILL_XP cooking 6'],
  },
  fitcast: {
    id: 'fitcast', label: 'FitCast', url: 'fitcast.example', category: 'tutorial',
    body: "A 20-minute bodyweight routine you can do between video calls. No equipment, moderate regret.",
    effects: ['ADD_SKILL_XP fitness 6'],
  },
  codeflow: {
    id: 'codeflow', label: 'CodeFlow Academy', url: 'codeflow.example', category: 'tutorial',
    body: "Lesson 1: writing your first script. It's mostly typos. Everyone's is, at first.",
    effects: ['ADD_SKILL_XP tech 6'],
  },
  // --- New sites (P8 content volume) ---
  reddit_lite: {
    id: 'reddit_lite', label: 'FrontPage', url: 'frontpage.example', category: 'social',
    body: "Top posts right now: someone asking if they're the asshole for eating their roommate's leftovers (verdict: yes), a time-lapse of someone's sourdough starter collapsing, and a heated debate about whether dishes in the sink count as 'soaking' or 'abandoned'.",
    effects: ['ADJUST_NEED player mood +0.03'],
  },
  weather: {
    id: 'weather', label: 'SkyCheck', url: 'skycheck.example', category: 'utility',
    body: "Today: partly cloudy, high of 72. Tomorrow: rain starting in the afternoon. This weekend: perfect for the park, if you remember to bring sunscreen.",
  },
  recipes: {
    id: 'recipes', label: 'PlateUp', url: 'plateup.example', category: 'tutorial',
    body: "Five meals you can make with what's probably already in your pantry. Number 3 will surprise you (it's pasta).",
    effects: ['ADD_SKILL_XP cooking 8'],
  },
  budget_tracker: {
    id: 'budget_tracker', label: 'CoinJar', url: 'coinjar.example', category: 'utility',
    body: "Your spending this week: $47 on takeout (yikes), $12 on coffee, $200 on groceries. The app gently suggests you maybe cook at home more.",
    effects: ['ADJUST_NEED player mood -0.02'],
  },
  social_feed: {
    id: 'social_feed', label: 'Chatter', url: 'chatter.example', category: 'social',
    body: "Your friend just posted a photo of their brunch. Someone you haven't talked to in three years got a promotion. A stranger is going viral for a very bad take about pizza.",
    effects: ['ADJUST_NEED player mood +0.02', 'ADJUST_NEED player energy -2'],
  },
  job_listings: {
    id: 'job_listings', label: 'CareerHub', url: 'careerhub.example', category: 'utility',
    body: "Remote positions hiring now: data entry (no experience needed), freelance developer (3+ years), and a café that needs someone for morning shifts. Apply through WorkHub.",
  },
  meditation: {
    id: 'meditation', label: 'CalmSpace', url: 'calmspace.example', category: 'wellness',
    body: "A 10-minute guided breathing exercise. Close your eyes. Breathe in for four. Hold for seven. Out for eight. Repeat until the rent stops feeling real.",
    effects: ['ADJUST_NEED player mood +0.06', 'ADJUST_NEED player energy +3'],
  },
  gaming_forum: {
    id: 'gaming_forum', label: 'PixelPress', url: 'pixelpress.example', category: 'gaming',
    body: "Hot takes: the new indie game everyone's playing is 'just Stardew Valley but darker', a 47-page thread about why the latest patch ruined everything, and someone's speedrun that breaks the game in 12 minutes.",
    effects: ['ADJUST_NEED player mood +0.04'],
  },
  afterhours: {
    id: 'afterhours', label: 'AfterHours', url: 'afterhours.example', category: 'adult',
    requiresContentFlag: 'mature',
    body: "AfterHours — the apartment's favorite late-night destination.",
    effects: ['ADJUST_NEED player mood +0.08', 'ADJUST_NEED player energy -3'],
    // Live porn site backed by Pornhub's webmaster API. Categories map
    // to search queries; clips are fetched at runtime via superFetch and
    // embedded as iframe players. Entries are NOT static — they're
    // fetched live when a category tab is opened, so the grid always
    // shows fresh content. See fetchAfterHoursClips in UI.COMPUTER.
    cumEffects: ['ADJUST_NEED player mood +0.25', 'ADJUST_NEED player energy -8', 'ADJUST_NEED player hygiene -5'],
    adultContent: {
      categories: [
        { id: 'featured',       label: 'Featured',   search: 'featured' },
        { id: 'amateur',        label: 'Amateur',    search: 'amateur' },
        { id: 'lesbian',        label: 'Lesbian',    search: 'lesbian' },
        { id: 'blowjob',        label: 'Blowjob',    search: 'blowjob' },
        { id: 'hardcore',       label: 'Hardcore',   search: 'hardcore' },
        { id: 'anal',           label: 'Anal',       search: 'anal' },
        { id: 'threesome',      label: 'Threesome',  search: 'threesome' },
        { id: 'milf',           label: 'MILF',        search: 'milf' },
        { id: 'big-tits',       label: 'Big Tits',   search: 'big-tits' },
        { id: 'cumshot',        label: 'Cumshots',   search: 'cumshot' },
        { id: 'rough',          label: 'Rough',      search: 'rough-sex' },
        { id: 'creampie',       label: 'Creampie',   search: 'creampie' },
        { id: 'interracial',    label: 'Interracial', search: 'interracial' },
        { id: 'verified',       label: 'Verified',   search: 'verified-amateurs' },
      ],
      // entries are fetched live — not stored in defs. See
      // fetchAfterHoursClips and browser.afterHoursClips in state.
    },
  },
};
const SITE_DEFS_LIST = Object.values(SITE_DEFS);

// --- Courses: paid, multi-lesson, real commitments. `requiresLevel` gates
// enrollment (the same skillLevel check JOB_DEFS' requiredSkills uses),
// not attendance — once enrolled you can always finish what you started. ---
const COURSE_DEFS = {
  knife_skills_101: {
    id: 'knife_skills_101', label: 'Knife Skills 101', skillId: 'cooking',
    cost: 60, lessons: 4, xpPerLesson: 15, ticksPerLesson: 2, requiresLevel: 0,
  },
  intro_to_scripting: {
    id: 'intro_to_scripting', label: 'Intro to Scripting', skillId: 'tech',
    cost: 90, lessons: 5, xpPerLesson: 15, ticksPerLesson: 2, requiresLevel: 0,
  },
  strength_fundamentals: {
    id: 'strength_fundamentals', label: 'Strength Fundamentals', skillId: 'fitness',
    cost: 75, lessons: 4, xpPerLesson: 15, ticksPerLesson: 2, requiresLevel: 0,
  },
  advanced_patisserie: {
    id: 'advanced_patisserie', label: 'Advanced Patisserie', skillId: 'cooking',
    cost: 150, lessons: 6, xpPerLesson: 20, ticksPerLesson: 3, requiresLevel: 3,
  },
};
const COURSE_DEFS_LIST = Object.values(COURSE_DEFS);

// --- Services: recurring hired help. `accessScope:'all'` means the
// bedrooms too, not just common rooms — a real boundary-violation source
// once STEALTH (P6) exists to notice: you didn't enter anyone's room, but
// you hired someone who did. Kept honest now (the cleaning itself is
// real) rather than half-built waiting for that phase. ---
const SERVICE_DEFS = {
  standard_cleaning: {
    id: 'standard_cleaning', label: 'TidyBot Cleaning (Common Areas)',
    costPerVisit: 40, cadenceDays: 7, accessScope: 'common',
  },
  deep_cleaning: {
    id: 'deep_cleaning', label: 'TidyBot Deep Clean (Whole Apartment)',
    costPerVisit: 90, cadenceDays: 7, accessScope: 'all',
  },
};
const SERVICE_DEFS_LIST = Object.values(SERVICE_DEFS);

// --- Shows: free to watch, cost time, lift mood. ---
const STREAM_DEFS = {
  the_neighborhood: { id: 'the_neighborhood', label: 'The Neighborhood', genre: 'sitcom', episodeTicks: 2, moodGain: 0.08 },
  murder_actually: { id: 'murder_actually', label: 'Murder, Actually', genre: 'crime drama', episodeTicks: 3, moodGain: 0.05 },
  bake_off_but_worse: { id: 'bake_off_but_worse', label: 'Bake Off (But Worse)', genre: 'reality', episodeTicks: 2, moodGain: 0.1 },
  // --- New shows (P8 content volume) ---
  deep_space_nine_to_five: { id: 'deep_space_nine_to_five', label: 'Deep Space Nine-to-Five', genre: 'sci-fi comedy', episodeTicks: 3, moodGain: 0.07 },
  the_great_debate: { id: 'the_great_debate', label: 'The Great Debate', genre: 'talk show', episodeTicks: 2, moodGain: 0.06 },
  wilderness: { id: 'wilderness', label: 'Wilderness', genre: 'nature documentary', episodeTicks: 4, moodGain: 0.04 },
  hot_ones_remake: { id: 'hot_ones_remake', label: 'Hot Ones (Remake)', genre: 'interview', episodeTicks: 2, moodGain: 0.09 },
  code_black_comedy: { id: 'code_black_comedy', label: 'Code Black', genre: 'medical drama', episodeTicks: 3, moodGain: 0.05 },
  renovation_rescue: { id: 'renovation_rescue', label: 'Renovation Rescue', genre: 'reality', episodeTicks: 2, moodGain: 0.08 },
  late_night_snacks: { id: 'late_night_snacks', label: 'Late Night Snacks', genre: 'cooking', episodeTicks: 2, moodGain: 0.07 },
  true_crime_files: { id: 'true_crime_files', label: 'True Crime Files', genre: 'true crime', episodeTicks: 4, moodGain: 0.03 },
  stand_up_hour: { id: 'stand_up_hour', label: 'Stand-Up Hour', genre: 'comedy', episodeTicks: 2, moodGain: 0.12 },
  apartment_hunters: { id: 'apartment_hunters', label: 'Apartment Hunters', genre: 'reality', episodeTicks: 2, moodGain: 0.06 },
};
const STREAM_DEFS_LIST = Object.values(STREAM_DEFS);

// ===== /SECTION: DEFS.COMPUTER =====
