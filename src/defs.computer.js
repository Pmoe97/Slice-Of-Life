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

const APP_DEFS = {
  work: {
    id: 'work', label: 'WorkHub', category: 'productivity', requires: [],
    entryScreen: 'dash',
    screens: {
      dash: { label: 'Dashboard', renderer: 'workhub', panels: ['job.summary', 'job.backlog', 'job.earnings'] },
      board: { label: 'Job Board', renderer: 'catalog', source: 'JOB_DEFS', rowAction: 'work.apply', rowActionLabel: 'Apply' },
    },
  },
  // "Nile" — an unsubtle Amazon knockoff. Everything ships next-day
  // regardless of what it is, to the hallway doormat, and someone else in
  // the apartment could get to it before you do (COMPUTER's checkoutCart
  // + UI's processDeliveriesForDay, which SPAWN_ITEMs onto the doormat
  // rather than teleporting straight into your inventory).
  shop: {
    id: 'shop', label: 'Nile', category: 'shopping', requires: [],
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
    entryScreen: 'catalog',
    screens: {
      catalog: { label: 'Catalog', renderer: 'catalog', source: 'COURSE_DEFS_LIST', rowAction: 'classes.enroll', rowActionLabel: 'Enroll' },
      enrolled: {
        label: 'My Courses', renderer: 'list', source: 'state:apps.classes.enrolled', emptyText: 'Not enrolled in anything.',
        labelFn: (row) => `${COURSE_DEFS[row.courseId]?.label} — ${row.progress}/${COURSE_DEFS[row.courseId]?.lessons} lessons`,
        rowAction: 'classes.attend-lesson', rowActionLabel: 'Attend Lesson',
      },
    },
  },
  // Hired help — a recurring subscription, not a one-off purchase. See
  // COMPUTER's processServiceVisitsForDay: a hired service visits on its
  // own cadence via day rollover, not something the player has to click
  // each time.
  services: {
    id: 'services', label: 'HomeCare', category: 'services', requires: [],
    entryScreen: 'catalog',
    screens: {
      catalog: { label: 'Available', renderer: 'catalog', source: 'SERVICE_DEFS_LIST', rowAction: 'services.hire', rowActionLabel: 'Hire' },
      hired: {
        label: 'Hired', renderer: 'list', source: 'state:apps.services.hired', emptyText: 'No services hired.',
        labelFn: (row) => `${SERVICE_DEFS[row.serviceId]?.label} — next visit Day ${row.nextDay}`,
        rowAction: 'services.cancel', rowActionLabel: 'Cancel',
      },
    },
  },
  // Roommate-wanted ads. Applicants are real NPCs (generated the same way
  // the initial cast is — SIM's rollCastSlot — with residency.status
  // 'prospective', an enum value the schema has always had and
  // resolveTick has always skipped, but which nothing produced until
  // now) rather than a lightweight preview record, so an accepted
  // applicant is already a fully-formed resident with no second
  // generation step.
  classifieds: {
    id: 'classifieds', label: 'RoomList', category: 'classifieds', requires: [],
    entryScreen: 'post',
    screens: {
      post: { label: 'Listing', renderer: 'dashboard', panels: ['classifieds.status'] },
      applicants: {
        label: 'Applicants', renderer: 'list', source: 'state:apps.classifieds.applicants',
        emptyText: 'No applicants yet — check back after posting.',
        labelFn: (npcId, gs) => {
          const npc = gs.npcs[npcId];
          return npc ? `${npc.bible.name} — ${npc.bible.occupation.title}` : 'Unknown applicant';
        },
        rowAction: 'classifieds.view-applicant', rowActionLabel: 'View',
      },
      detail: { label: 'Applicant', renderer: 'applicant', hideFromNav: true },
    },
  },
  // Real conversations with residents, through the exact same LLM
  // proposal contract doTalk/doPlayerAction already use — a reply can
  // move relPlayer, land a memory fact, everything a scene conversation
  // can do. NPC-initiated texts (a pendingIntent an autonomy drive sets)
  // aren't wired yet since autonomy (P7) doesn't exist; threads are
  // player-initiated only for now.
  im: {
    id: 'im', label: 'Messages', category: 'social', requires: [],
    entryScreen: 'threads',
    screens: {
      threads: {
        label: 'Threads', renderer: 'list', source: 'residents', emptyText: 'No one to text yet.',
        labelFn: (npcId, gs) => {
          const npc = gs.npcs[npcId];
          const unread = gs.world.computer.apps.im.threads[npcId]?.unread;
          return `${npc?.bible.name || 'Unknown'}${unread ? ` (${unread})` : ''}`;
        },
        rowAction: 'im.open-thread', rowActionLabel: 'Open',
      },
      chat: { label: 'Chat', renderer: 'chat', hideFromNav: true },
    },
  },
  // The simplest app: one screen, watching costs time and lifts mood, no
  // sub-navigation needed. Rounds out P4 by reusing `catalog` with zero
  // new render code at all — not even a `.cost` fallback, since shows are
  // free to watch (the price column just renders empty).
  stream: {
    id: 'stream', label: 'Streamly', category: 'entertainment', requires: [],
    entryScreen: 'browse',
    screens: {
      browse: { label: 'Browse', renderer: 'streamly', source: 'STREAM_DEFS_LIST', rowAction: 'stream.watch', rowActionLabel: 'Watch Episode' },
    },
  },
};

// --- Jobs: what WorkHub's board offers, and what working a block pays.
// `qualitySkill` (optional) is read through SKILLS' payMultiplier curve —
// getting better at the relevant skill raises pay on top of the base
// rate. `requiredSkills` gates applying, not working once hired. ---
const JOB_DEFS = {
  cafe_temp: {
    id: 'cafe_temp', title: 'Café Temp (Remote Scheduling)', payPerBlock: 22,
    requiredSkills: {}, qualitySkill: null,
    blocksPerDeadline: 4, deadlineEveryDays: 1, firingStrikes: 3,
    energyPerBlock: 6, repGrowth: 0.05,
  },
  data_entry: {
    id: 'data_entry', title: 'Remote Data Entry', payPerBlock: 30,
    requiredSkills: {}, qualitySkill: 'tech',
    blocksPerDeadline: 6, deadlineEveryDays: 2, firingStrikes: 3,
    energyPerBlock: 5, repGrowth: 0.04,
  },
  freelance_dev: {
    id: 'freelance_dev', title: 'Freelance Developer', payPerBlock: 55,
    requiredSkills: { tech: 3 }, qualitySkill: 'tech',
    blocksPerDeadline: 8, deadlineEveryDays: 3, firingStrikes: 2,
    energyPerBlock: 7, repGrowth: 0.03,
  },
};

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
    // Browsable adult content with categories. Each category has a set
    // of video/post entries with titles. The browser renders these as
    // a grid of thumbnails. Clicking one generates a scene image via
    // generateImage and applies mood/arousal effects.
    adultContent: {
      categories: [
        { id: 'featured', label: 'Featured', weight: 3 },
        { id: 'amateur', label: 'Amateur', weight: 2 },
        { id: 'couples', label: 'Couples', weight: 2 },
        { id: 'solo', label: 'Solo', weight: 2 },
        { id: 'roleplay', label: 'Roleplay', weight: 1 },
      ],
      entries: [
        { id: 'ah_01', title: 'Late Night Session', category: 'featured', desc: 'Two strangers meet at a bar after last call.' },
        { id: 'ah_02', title: 'Roommates', category: 'couples', desc: 'Thin walls, shared laundry, and a tension that finally snaps.' },
        { id: 'ah_03', title: 'After Shower', category: 'amateur', desc: 'A steamy bathroom and a dropped towel.' },
        { id: 'ah_04', title: 'Bedroom Eyes', category: 'solo', desc: 'Just one person, a mirror, and no inhibitions.' },
        { id: 'ah_05', title: 'The Interview', category: 'roleplay', desc: 'A job interview that takes an unexpected turn.' },
        { id: 'ah_06', title: 'Night Shift', category: 'featured', desc: 'Working late has its perks.' },
        { id: 'ah_07', title: 'Pool House', category: 'couples', desc: 'A summer fling remembered in detail.' },
        { id: 'ah_08', title: 'Morning Routine', category: 'solo', desc: 'Waking up with nowhere to be and nothing to hide.' },
        { id: 'ah_09', title: 'Room Service', category: 'roleplay', desc: 'A hotel, a knock at the door, and a very generous tip.' },
        { id: 'ah_10', title: 'Study Break', category: 'amateur', desc: 'Cramming for finals takes a detour.' },
        { id: 'ah_11', title: 'The Artist', category: 'solo', desc: 'A life drawing class where the model gets comfortable.' },
        { id: 'ah_12', title: 'Backseat', category: 'couples', desc: 'A parked car and fogged windows.' },
      ],
    },
    // Effects applied when watching a specific entry (in addition to base)
    watchEffects: ['ADJUST_NEED player mood +0.12', 'ADJUST_NEED player energy -5', 'ADJUST_NEED player hygiene -2'],
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
