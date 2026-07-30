// ===== SECTION: DEFS.COMPUTER =====
// App registry and per-app content data. A new app is an APP_DEFS entry +
// a data source + (ideally) zero new render code — see RENDER.COMPUTER's
// small set of generic renderers (dashboard/catalog/...), which every
// app's screens are declared against rather than each app writing its own
// DOM code.
//
// Only 'work' exists so far — shop/browser/classes/services/classifieds/
// im/stream/adult land in later passes, each adding one APP_DEFS entry and
// whatever data source it needs, following this same shape.

const APP_DEFS = {
  work: {
    id: 'work', label: 'WorkHub', category: 'productivity', requires: [],
    entryScreen: 'dash',
    screens: {
      dash: { renderer: 'dashboard', panels: ['job.summary', 'job.backlog', 'job.earnings'] },
      board: { renderer: 'catalog', source: 'JOB_DEFS', rowAction: 'work.apply', rowActionLabel: 'Apply' },
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

// ===== /SECTION: DEFS.COMPUTER =====
