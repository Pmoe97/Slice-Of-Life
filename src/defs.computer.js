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
      dash: { label: 'Dashboard', renderer: 'dashboard', panels: ['job.summary', 'job.backlog', 'job.earnings'] },
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
      browse: { label: 'Browse', renderer: 'catalog', source: 'SHOP_CATALOG_LIST', rowAction: 'shop.add-to-cart', rowActionLabel: 'Add to Cart' },
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
      home: { label: 'Home', renderer: 'catalog', source: 'SITE_DEFS_LIST', rowAction: 'browser.visit', rowActionLabel: 'Visit' },
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
  afterhours: {
    id: 'afterhours', label: 'AfterHours', url: 'afterhours.example', category: 'adult',
    requiresContentFlag: 'mature',
    body: "(You're on AfterHours. It's exactly what it sounds like.)",
    effects: ['ADJUST_NEED player mood +0.1', 'ADJUST_NEED player energy -5', 'ADJUST_NEED player hygiene -3'],
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

// ===== /SECTION: DEFS.COMPUTER =====
