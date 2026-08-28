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
      // `catalog`/`cartPath`/`cartRowAction`/`checkoutAction` are read by the
      // shared 'nile' renderer (RENDER.COMPUTER) — Nile and Home both run it,
      // each pointing at its own defs table and cart (see the Home app below).
      browse: { label: 'Browse', renderer: 'nile', source: 'SHOP_CATALOG_LIST', catalog: 'ITEM_DEFS', cartPath: 'apps.shop.cart',
                rowAction: 'shop.add-to-cart', rowActionLabel: 'Add to Cart',
                cartRowAction: 'shop.remove-from-cart', checkoutAction: 'shop.checkout' },
      cart: {
        label: 'Cart', renderer: 'list', source: 'state:apps.shop.cart', emptyText: 'Your cart is empty.',
        labelFn: (row) => `${ITEM_DEFS[row.defId]?.label || row.defId} × ${row.units} — ${(ITEM_DEFS[row.defId]?.price || 0) * row.units}`,
        rowAction: 'shop.remove-from-cart', rowActionLabel: 'Remove',
        footerAction: 'shop.checkout', footerActionLabel: 'Checkout',
      },
    },
  },
  // "Home" — the furniture app (decor-economy plan, D1). A second shop:
  // same next-day doormat checkout/delivery shape as Nile (D2 — checkoutCart
  // is the SAME function, just pointed at DECOR_CATALOG_DEFS and this app's
  // own cart), but a different catalog — DECOR_CATALOG_DEFS entries are
  // priced DESIGN_SHAPES placements, not ITEM_DEFS goods. The in-game
  // placement screen (the `home-placement` renderer + the `place` screen
  // def) shipped with Phase 2 (D9).
  home: {
    id: 'home', label: 'Home', category: 'shopping', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'browse',
    screens: {
      browse: { label: 'Browse', renderer: 'nile', source: 'DECOR_CATALOG_LIST', catalog: 'DECOR_CATALOG_DEFS', cartPath: 'apps.home.cart',
                rowAction: 'home.add-to-cart', rowActionLabel: 'Add to Cart',
                cartRowAction: 'home.remove-from-cart', checkoutAction: 'home.checkout' },
      cart: {
        label: 'Cart', renderer: 'list', source: 'state:apps.home.cart', emptyText: 'Your cart is empty.',
        labelFn: (row) => `${DECOR_CATALOG_DEFS[row.defId]?.label || row.defId} × ${row.units} — ${(DECOR_CATALOG_DEFS[row.defId]?.price || 0) * row.units}`,
        rowAction: 'home.remove-from-cart', rowActionLabel: 'Remove',
        footerAction: 'home.checkout', footerActionLabel: 'Checkout',
      },
      // D9 — shipped with its renderer (the `home-placement` renderer, in
      // RENDER.COMPUTER): the in-game Studio screen. Same select/drag/resize/
      // rotate interaction as dev/designer.html's Place tab, over the
      // player's own placed decor objects instead of the dev-authored config.
      place: { label: 'Place', renderer: 'home-placement' },
    },
  },
  // "QuickCart" — an Instacart parody, and Nile's grocery-carrying twin
  // split apart into its own app: same-day, not next-day, and one store
  // rather than "everything." `browse` reuses the exact same `nile`
  // renderer Nile/Home already share (GROCERY_CATALOG_LIST/ITEM_DEFS,
  // computer.js's generic addToCart/removeFromCart) — only checkout
  // diverges from checkoutCart's next-day pipeline (COMPUTER's
  // placeGroceryOrder + UI's processGroceryOrdersNow, modeled on DoorDrop's
  // same-day driver-visit mechanism, minus the restaurant-picking step).
  // `cart`/`orders` are bespoke renderers (not the generic `list`) so the
  // fee breakdown, tip picker, and live ETA countdown all have somewhere
  // to live — mirrors DoorDrop's own cart/orders pair.
  grocery: {
    id: 'grocery', label: 'QuickCart', category: 'shopping', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'browse',
    screens: {
      browse: { label: 'Browse', renderer: 'nile', source: 'GROCERY_CATALOG_LIST', catalog: 'ITEM_DEFS', cartPath: 'apps.grocery.cart',
                rowAction: 'grocery.add-to-cart', rowActionLabel: 'Add to Cart',
                cartRowAction: 'grocery.remove-from-cart', checkoutAction: 'grocery.checkout' },
      cart: { label: 'Cart', renderer: 'grocery-cart' },
      orders: { label: 'Orders', renderer: 'grocery-orders' },
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
      // The maid (external-world plan Phase 3) gets her own screen: a
      // per-day schedule grid doesn't fit the flat catalog rows.
      maid: { label: 'Housekeeper', renderer: 'homecare-maid' },
    },
  },
  // Escorts (external-world plan Phase 7): a small persistent roster of full
  // NPCs, each with their own advertised à la carte menu (decision 14). The
  // profile screen's checklist renders ONLY that escort's offered services
  // (mature ones filtered by content flags); the purchased set becomes the
  // visit's dual enforcement (prompt boundaries + mechanical gating). Same
  // app-shape convention as the maid: booking state lives in
  // world.escortBookings, not here — this object is just which profile is
  // open, so navigation survives a reload (viewingNpcId).
  escorts: {
    id: 'escorts', label: 'Escorts', category: 'services', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'browse',
    screens: {
      browse: { label: 'Browse', renderer: 'escorts-browse' },
      profile: { label: 'Profile', renderer: 'escorts-profile', hideFromNav: true },
      bookings: { label: 'My Bookings', renderer: 'escorts-bookings' },
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
      // Move-in offers (external-world plan Phase 8): external NPCs a
      // resident (or the player) vouched for in conversation, routed into
      // the same assign flow a Classifieds applicant uses. Nav-visible so
      // the player can find a waiting offer without hunting.
      offers: { label: 'Offers', renderer: 'roomlist-offers' },
      detail: { label: 'Profile', renderer: 'applicant', hideFromNav: true },
      assign: { label: 'Assign Room', renderer: 'roomlist-assign', hideFromNav: true },
    },
  },
  // The Sprite Studio (avatars-and-sprite-studio-plan Phase 4, D16).
  // A plain `utility` app rather than an in-fiction consumer product: the
  // computer's OS chrome already supports system utilities, and dressing an
  // out-of-fiction asset editor up as a brand would be a costume, not a
  // fiction. `devices` carries BOTH surfaces — render.phone.js reuses
  // COMPUTER_RENDERERS unchanged, so the split costs one capability check
  // rather than a second implementation. The paint canvas (Phase 5) is
  // computer-only and the phone says so with a real affordance rather than a
  // missing button; `editor` and `recrop` are hideFromNav because you reach
  // them from a sprite cell or the avatar panel, never from the tab bar.
  sprites: {
    id: 'sprites', label: 'Sprite Studio', category: 'utility', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'roster',
    screens: {
      roster: { label: 'Roster', renderer: 'sprites-roster' },
      character: { label: 'Character', renderer: 'sprites-character', hideFromNav: true },
      editor: { label: 'Editor', renderer: 'sprites-editor', hideFromNav: true },
      recrop: { label: 'Recrop', renderer: 'sprites-recrop', hideFromNav: true },
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
  // src/ref/BrineOS-The-Phone-plan.md). Old saves with open bills/invest
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
  // back. See src/ref/complete/apartment-upgrades-plan.md.
  upgrades: {
    id: 'upgrades', label: 'RenoFix', category: 'home', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'dashboard',
    screens: {
      dashboard: { label: 'Apartment', renderer: 'upgrades-dashboard' },
    },
  },
  // "DoorDrop" — the food-delivery app (external-world plan Phase 5). Pick a
  // restaurant, fill a cart, choose when you want it, then watch a real
  // driver's ETA count down. Unlike Nile (next-day, materialises on the
  // doormat), the food arrives with a person: the order schedules a
  // purpose:'delivery' visit at the entry, and the handover happens when
  // they get there — see placeFoodOrder (COMPUTER) and processFoodOrdersNow
  // (UI).
  food: {
    id: 'food', label: 'DoorDrop', category: 'food', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'browse',
    screens: {
      browse: { label: 'Restaurants', renderer: 'doordrop-browse' },
      menu: { label: 'Menu', renderer: 'doordrop-menu', hideFromNav: true },
      cart: { label: 'Cart', renderer: 'doordrop-cart' },
      orders: { label: 'Orders', renderer: 'doordrop-orders' },
    },
  },
  // ChefBook (food-overhaul Phase 8, D21/D22): the recipe website. Cards
  // publish from RECIPES via the cooking engine (COMPUTER's
  // recipeCardsFromEngine) plus every RESTAURANT_DISH_IDS dish, gated
  // unlock-on-taste — a card exists on this app only once
  // apps.recipes.unlockedIds contains its id (the EAT_ITEM hook in
  // EFFECTS' applyEatItem registers it the moment the player tastes it).
  // `detail` is a drill-down (hidden from sub-nav, like Classifieds'
  // applicant profile); `planner` is the standalone Meal Planner screen
  // (D22) with its own add-row UI and a "fill the missing ingredients into
  // the Nile cart" action.
  recipes: {
    id: 'recipes', label: 'ChefBook', category: 'food', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'browse',
    screens: {
      browse: { label: 'Recipes', renderer: 'recipes-browse' },
      detail: { label: 'Recipe', renderer: 'recipes-detail', hideFromNav: true },
      planner: { label: 'Meal Planner', renderer: 'recipes-planner' },
    },
  },
  // Phase 11 investing now lives inside Brine Bank as its Portfolia screen
  // (see the bank app above); the holdings data stayed in computer.apps
  // .invest so invest-dashboard and the invest handlers work unmodified.
  // Intimacy & Voyeurism Phase 15 (D8): the CODEX — the per-character
  // knowledge ledger. A roster of every NPC the player has ledger entries
  // for, then per-NPC pages of day-stamped entries with the three spendable
  // verbs (Confront / Spread / Matchmake). Reads player.ledger via
  // codex.js; the 'codex-*' renderers live in RENDER.COMPUTER and render on
  // both devices (the shared-app path). Detail is a drill-down, not a
  // parallel view, so it is hidden from the sub-nav like the other
  // drill-downs.
  codex: {
    id: 'codex', label: 'Codex', category: 'social', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'roster',
    screens: {
      roster: { label: 'People', renderer: 'codex-roster' },
      detail: { label: 'Profile', renderer: 'codex-detail', hideFromNav: true },
    },
  },
  // Dream Engine Phase 8 (D42): the Dream Diary — every dream the player has
  // watched, filed by fileDreamToDiary (dreams.js) newest-first and capped at
  // DREAM_TUNING.diaryCap. The gallery is a list of first-panel thumbnails;
  // the detail page repaints all panels from their frozen prompt+seed (D14)
  // via getDreamPanelImage and reprints the register's wake line (D42). A
  // shared phone/computer app exactly like codex; the 'dreams.*' renderers
  // live in RENDER.COMPUTER, declared for both devices.
  dreams: {
    id: 'dreams', label: 'Dream Diary', category: 'personal', requires: [],
    devices: ['computer', 'phone'],
    entryScreen: 'diary',
    screens: {
      diary: { label: 'Dreams', renderer: 'dreamdiary' },
      entry: { label: 'Dream', renderer: 'dreamentry', hideFromNav: true },
    },
  },
};

// --- Decor catalog: what the Home app sells (decor-economy plan) ---
// A catalog entry is priced, buyable, and names which DESIGN_SHAPES entry
// it places once delivered and placed. Distinct from DESIGN_SHAPES itself
// (the catalog is what's for sale; DESIGN_SHAPES is how it's drawn) and
// from ITEM_DEFS (deliberately NOT there — a price in ITEM_DEFS would
// enrol a sofa into SHOP_CATALOG_LIST and onto Nile, which is exactly the
// boundary D1 defends). `category` is the ROOM the piece furnishes, which
// is what the anchor-availability work (continuous-behavior-engine plan
// Phase 3) keys on. Launch breadth is enough to fully furnish the living
// room (a sofa and a TV stand, at minimum — the plan's Phase 3 worked
// example must be literally buyable); the rest is a curated first pass.
const DECOR_CATALOG_DEFS = {
  // --- living room ---
  sofa_basic: { id: 'sofa_basic', label: 'Sofa', price: 340, buyQty: 1, shape: 'sofa', category: 'living_room' },
  armchair: { id: 'armchair', label: 'Armchair', price: 150, buyQty: 1, shape: 'armchair', category: 'living_room' },
  coffee_table: { id: 'coffee_table', label: 'Coffee Table', price: 110, buyQty: 1, shape: 'coffee_table', category: 'living_room' },
  tv_basic: { id: 'tv_basic', label: 'TV', price: 280, buyQty: 1, shape: 'tv', category: 'living_room' },
  tv_stand: { id: 'tv_stand', label: 'TV Stand', price: 130, buyQty: 1, shape: 'shelf', category: 'living_room' },
  rug: { id: 'rug', label: 'Rug', price: 90, buyQty: 1, shape: 'rug', category: 'living_room' },
  floor_lamp: { id: 'floor_lamp', label: 'Floor Lamp', price: 45, buyQty: 1, shape: 'lamp', category: 'living_room' },
  plant: { id: 'plant', label: 'Plant', price: 35, buyQty: 1, shape: 'plant', category: 'living_room' },
  // --- bedroom ---
  bed_basic: { id: 'bed_basic', label: 'Bed', price: 420, buyQty: 1, shape: 'bed', category: 'bedroom' },
  nightstand: { id: 'nightstand', label: 'Nightstand', price: 60, buyQty: 1, shape: 'nightstand', category: 'bedroom' },
  wardrobe: { id: 'wardrobe', label: 'Wardrobe', price: 180, buyQty: 1, shape: 'wardrobe', category: 'bedroom' },
  desk: { id: 'desk', label: 'Desk', price: 140, buyQty: 1, shape: 'desk', category: 'bedroom' },
  desk_chair: { id: 'desk_chair', label: 'Desk Chair', price: 70, buyQty: 1, shape: 'desk_chair', category: 'bedroom' },
  // --- dining / kitchen ---
  dining_table: { id: 'dining_table', label: 'Dining Table', price: 200, buyQty: 1, shape: 'dining_table', category: 'dining' },
  dining_chair: { id: 'dining_chair', label: 'Chair', price: 40, buyQty: 1, shape: 'chair', category: 'dining' },
  // --- utility / decor ---
  bookshelf: { id: 'bookshelf', label: 'Bookshelf', price: 130, buyQty: 1, shape: 'bookshelf', category: 'study' },
  shelf: { id: 'shelf', label: 'Wall Shelf', price: 60, buyQty: 1, shape: 'shelf', category: 'study' },
};
// Mirrors SHOP_CATALOG_LIST's derivation (ITEMS) — the Home app's browse
// screen reads this list, so every priced catalog entry is buyable and no
// parallel hand-authored list can drift from the defs.
const DECOR_CATALOG_LIST = Object.values(DECOR_CATALOG_DEFS).filter(d => d.id !== '_unknown' && d.price != null);

// --- Jobs: what WorkHub's board offers, and what working a block pays.
// `qualitySkill` (optional) is read through SKILLS' payMultiplier curve —
// getting better at the relevant skill raises pay on top of the base
// rate. `requiredSkills` gates applying, not working once hired. ---
// --- Gig board (Phase 2 — vocation rewrite) ---
// Replaces JOB_DEFS. The player is a freelancer: accept discrete gigs,
// work them block-by-block, deliver by a deadline. Income is lumpy by
// design — dry spells happen. See src/ref/vocation-and-gigs-plan.md.
//
// A template is the *shape* of an available gig; instances are generated
// seeded on day rollover (generateGigsForDay) with payout/blocks/deadline
// rolled within the template's ranges and scaled by reputation tier.
const GIG_TEMPLATES = {
  data_entry: {
    id: 'data_entry', label: 'Data Entry Batch', category: 'admin',
    skill: 'tech', minSkill: 0,
    blocksRange: [3, 8], deadlineRange: [3, 7], basePayoutPerBlock: 35,
    clientPool: ['Meridian Logistics', 'Crestline Retail', 'Harbor Data Co', 'Pinebrook Clinic'],
  },
  web_tweak: {
    id: 'web_tweak', label: 'Website Tweak', category: 'web',
    skill: 'tech', minSkill: 2,
    blocksRange: [4, 10], deadlineRange: [3, 8], basePayoutPerBlock: 60,
    clientPool: ['Lumen Studio', 'Northgate Bakery', 'Field & Fern Co', 'Sablewood Designs'],
  },
  copy_edit: {
    id: 'copy_edit', label: 'Copy Edit Pass', category: 'writing',
    skill: 'tech', minSkill: 1,
    blocksRange: [3, 9], deadlineRange: [3, 9], basePayoutPerBlock: 50,
    clientPool: ['Quill & Page', 'Lighthouse Press', 'Marlow Books', 'Saltmarsh Media'],
  },
  script_automation: {
    id: 'script_automation', label: 'Automation Script', category: 'dev',
    skill: 'tech', minSkill: 3,
    blocksRange: [6, 14], deadlineRange: [4, 9], basePayoutPerBlock: 90,
    clientPool: ['Vantage Analytics', 'GreenlineOps', 'Cobalt Systems', 'Tidepool HR'],
  },
  app_feature: {
    id: 'app_feature', label: 'App Feature Build', category: 'dev',
    skill: 'tech', minSkill: 4,
    blocksRange: [10, 20], deadlineRange: [5, 10], basePayoutPerBlock: 150,
    clientPool: ['Bramble Inc', 'Hollowpoint Games', 'Cedar & Co', 'Northstar Apps'],
  },
  infra_project: {
    id: 'infra_project', label: 'Infrastructure Project', category: 'dev',
    skill: 'tech', minSkill: 5,
    blocksRange: [14, 30], deadlineRange: [6, 10], basePayoutPerBlock: 220,
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

// Energy cost of gig work, per BLOCK of progress. Gigs pay lump sums on
// delivery, so each block is progress, not a wage.
// 2026-08-17 audit (B5): 6 → 5. The gig economy was too steep — 70 energy
// capped a day at ~11.6 clicks (≈ the whole day's rent at full grind), and
// the focus collapse at low energy/mood made real progress a fraction of
// that. 5/block widened the energy budget to ~14 blocks/day. See
// bug-fix-audit-2026-08-17.md.
// 2026-08-20 retune (playtest feedback): with GIG_TUNING.progressPerClick=2
// each click completes up to 2 blocks, so the cost is 10 energy/click to
// hold the ~14-blocks-per-day ceiling steady. Same daily income capacity,
// half the clicks — the fix for "too clicky", not a raise.
const GIG_ENERGY_PER_BLOCK = 10;
// Wall-clock minutes one work-block click takes. A flat time-cost for a
// single block, not a scheduling window — deliberately detached from
// CLOCK.tickMinutes so a future change to (or retirement of) the tick grid
// can't silently change how long a gig work session takes.
// (external-world-retiming plan, D5.)
//
// progressPerClick: how many BLOCKS of progress one work click advances at
// full focus. 2026-08-20 retune (playtest feedback): the early game read as
// clicky — a 7-block gig was 7+ clicks on top of sleep/eat/burnout. Each
// click now completes up to 2 blocks (× focus, see computeFocusMultiplier),
// so a gig takes roughly half its block count of clicks at full rest.
// Burnout counts actual blocks done, not clicks, so grind pressure survives
// at a saner click count.
const GIG_TUNING = { workBlockMinutes: 30, progressPerClick: 2 };
// Max concurrent gigs — the deadline pressure does the limiting.
const GIG_MAX_CONCURRENT = 3;
// Reputation movement. Delivery on time gains rep roughly equal to the gig's
// size (GIG_REP_DELIVERY per GIG_REP_SIZE_BLOCK blocks, capped), with a
// small bonus for handing work in well ahead of the deadline; a miss scales
// down by how late it was; abandoning is worse. 2026-08-20 retune: rep used
// to crawl — a 7-block gig earned +2, so Competent (20) took ~10 gigs. Now
// that same gig earns +7, so each tier takes a handful of deliveries and
// promotions feel like they arrive. See gigRepScale below.
const GIG_REP_DELIVERY = 5;     // base rep gain per delivered gig
const GIG_REP_EARLY_BONUS = 2;  // extra rep for delivering 2+ days early
const GIG_REP_MISS = -8;        // per missed-deadline gig
const GIG_REP_ABANDON = -15;    // per abandoned gig
const GIG_REP_MAX = 100;
// Reputation scales with a gig's size — the same scale drives gains and
// penalties, so a missed 30-block project hurts as much as a 30-block
// delivery rewards. One block of delivered work ≈ one point of rep.
const GIG_REP_SIZE_BLOCK = 5;   // divisor — rep gain per delivered block
const GIG_REP_SIZE_MIN = 0.6;   // floor (a 3-block gig still gains ~3)
const GIG_REP_SIZE_MAX = 4;     // cap (an infra project gains up to 20)

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

// AfterHours Site Expansion Phase 5 — the parody ad network. Every entry
// is authored chrome (Locked decision 12): campy, self-aware, CSS/emoji
// text only, no AI art, never API-derived. `slot` places it ('banner' =
// wide strip, 'skyscraper' = tall rail); `copy`/`cta` are the body and
// button. Kinds: default = classic text+button ad; 'update' = the fake
// browser-update prompt (OK → toast, Cancel → does nothing, the joke);
// 'visitor' = the "you are visitor #1,000,000" classic with a countdown
// that resets on each re-show. Clicks never leave the sandbox — the CTA
// toasts a campy non-follow.
const AH_ADS = [
  { slot: 'banner', kind: null, copy: 'HornyGoat™ Max Dose — for the times two just isn\u2019t enough.', cta: 'Try HornyGoat™', href: 'hornygoat.example', emoji: '🐐' },
  { slot: 'banner', copy: 'Hot MILFs in YOUR area are waiting to meet you!', cta: 'Meet them now', href: 'milfs.example', emoji: '🔥' },
  { slot: 'banner', kind: 'visitor', copy: 'Congratulations! You are visitor #1,000,000!', cta: 'Claim my prize', href: 'prize.example', emoji: '🎉' },
  { slot: 'banner', copy: 'Spin & Win Casino — this spin is statistically your turn.', cta: 'Spin the wheel', href: 'casino.example', emoji: '🎰' },
  { slot: 'banner', kind: 'update', title: 'AfterHours Browser Update', copy: 'A new version of AfterHours Browser is ready. Install now to watch in 4K. (This is a fake ad. Nothing is installing.)', ctaOk: 'Update now', ctaCancel: 'Later', emoji: '⬇' },
  { slot: 'banner', copy: 'Local singles want to text you at 3AM. Who are we to judge?', cta: 'Say hi', href: 'textme.example', emoji: '💬' },
  { slot: 'banner', copy: 'Earn $2,000/week from home. Your roommates will never know.', cta: 'Learn the secret', href: 'sidehustle.example', emoji: '💵' },
  { slot: 'skyscraper', copy: 'HornyGoat™ Max Dose.', cta: 'Goat it', href: 'hornygoat.example', emoji: '🐐' },
  { slot: 'skyscraper', copy: 'One click. That\u2019s all it takes.', cta: 'Click me', href: 'oneclick.example', emoji: '👆' },
  { slot: 'skyscraper', copy: 'Your neighbors are watching this site right now.', cta: 'Prove it', href: 'neighbors.example', emoji: '👀' },
];

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

// The maid (external-world plan Phase 3) is deliberately NOT a SERVICE_DEFS
// entry: those are fire-and-forget cadence hires with a flat per-visit cost,
// and hers is a scheduled contract with a per-day window grid, add-ons, and
// an actual person attached. It lives in the same HomeCare app and the same
// services.hired[] array, but carries its own record shape — see
// MAID_TUNING (config.js) and hireMaidContract (COMPUTER).
const MAID_SERVICE_ID = 'maid';
const MAID_ADDONS = {
  bedrooms: { id: 'bedrooms', label: 'Bedrooms & private rooms', desc: 'She cleans the whole apartment, not just shared space. She will be in your roommates’ rooms.' },
  laundry:  { id: 'laundry',  label: 'Laundry', desc: 'She works the hamper down while she’s here. Real loads take real time.' },
  cooking:  { id: 'cooking',  label: 'Meal prep', desc: 'She leaves prepared food in the kitchen on longer visits.' },
};
const MAID_ADDONS_LIST = Object.values(MAID_ADDONS);
const SERVICE_DEFS_LIST = Object.values(SERVICE_DEFS);

// --- Restaurants: what DoorDrop delivers (external-world plan Phase 5) ---
// `menu` entries are { itemId, price }: the DISH is a real ITEM_DEFS entry
// (defs.world.js) but its PRICE lives here, per restaurant, deliberately —
// a `price` on the item def would enrol takeout in Nile's catalog, which
// builds itself from every priced item (SHOP_CATALOG_LIST). This is the one
// place the plan's sketched `menu: [itemIds]` had to grow a field.
//
// `prepMinutes` is the kitchen's own turnaround, added to travel time
// (FOOD_TUNING) to produce the ETA. `hours` is [openMinute, closeMinute) in
// minutes-from-midnight — a RECURRING daily rule, not a one-shot day-scoped
// window — a closed kitchen refuses the order rather than quietly delivering
// at 4am. A window with open > close wraps across midnight ([0, 1410] = the
// all-day sentinel, the old tick sentinel [0, 47] × 30); see
// getRestaurantWindows / formatRestaurantHours (COMPUTER). `service` is the
// meal-category the DoorDrop browse filter groups by: breakfast | lunch |
// dinner | late | 24h.
const RESTAURANT_DEFS = {
  // --- The target roster (restaurant network overhaul Phase 3) ---
  // 12 places total, six new below. Every menu's prices are ~$0.30-0.35 per
  // hunger point for normal joints, cheaper for breakfast/diner fare, richer
  // for kaisen/emerald. Existing restaurantIds and all pre-existing itemIds
  // are unchanged so in-flight world.foodOrders keep resolving.
  sunrise_cafe: {
    id: 'sunrise_cafe', label: 'Sunrise Cafe', cuisine: 'Café',
    blurb: 'Burn the first pancake of every shift, remember your order forever, close by lunch.',
    service: 'breakfast', deliveryFeeBase: 2, prepMinutes: 10, hours: [360, 840],
    menu: [
      { itemId: 'dish_pancake_stack', price: 11 },
      { itemId: 'dish_belgian_waffle', price: 12 },
      { itemId: 'dish_breakfast_sandwich', price: 10 },
      { itemId: 'dish_avocado_toast', price: 9 },
      { itemId: 'dish_hash_brown_bowl', price: 8 },
      { itemId: 'dish_granola_bowl', price: 10 },
      { itemId: 'dish_breakfast_potatoes', price: 6 },
      { itemId: 'dish_fresh_coffee', price: 4 },
      { itemId: 'dish_oat_latte', price: 6 },
      { itemId: 'dish_orange_juice_pitcher', price: 5 },
      { itemId: 'dish_croissant', price: 5 },
      { itemId: 'dish_bagel_cc', price: 7 },
    ],
  },
  corner_deli: {
    id: 'corner_deli', label: 'Corner Deli', cuisine: 'Soup & Deli',
    blurb: 'Steam on the window, a knife block older than the landlord, a lunch rush that moves like a riot.',
    service: 'lunch', deliveryFeeBase: 2, prepMinutes: 12, hours: [600, 960],
    menu: [
      { itemId: 'dish_pho_ga', price: 12 },
      { itemId: 'dish_tomato_soup_bowl', price: 8 },
      { itemId: 'dish_bread_bowl_chili', price: 12 },
      { itemId: 'dish_chicken_flatbread', price: 11 },
      { itemId: 'dish_salad_medley', price: 10 },
      { itemId: 'dish_mushroom_soup', price: 9 },
      { itemId: 'dish_half_sandwich_soup', price: 11 },
      { itemId: 'dish_grilled_cheese_deli', price: 9 },
      { itemId: 'dish_lemonade_pitcher', price: 5 },
      { itemId: 'dish_turkey_club', price: 12 },
    ],
  },
  big_bite: {
    id: 'big_bite', label: 'Big Bite Burgers', cuisine: 'American',
    blurb: 'Fast, greasy, open 24 hours. The fries arrive lukewarm and nobody has ever complained.',
    service: '24h', deliveryFeeBase: 3, prepMinutes: 15, hours: [0, 1410],
    menu: [
      { itemId: 'dish_double_burger', price: 15 },
      { itemId: 'dish_fries', price: 6 },
      { itemId: 'dish_milkshake', price: 7 },
      { itemId: 'dish_breakfast_burger', price: 11 },
      { itemId: 'dish_sausage_egg_muffin', price: 8 },
      { itemId: 'dish_pancakes', price: 9 },
      { itemId: 'dish_hash_browns', price: 5 },
      { itemId: 'dish_chicken_sandwich', price: 13 },
      { itemId: 'dish_onion_rings', price: 7 },
      { itemId: 'dish_bacon_burger', price: 16 },
      { itemId: 'dish_nuggets', price: 8 },
      { itemId: 'dish_lemonade', price: 4 },
      { itemId: 'dish_apple_pie', price: 6 },
    ],
  },
  the_greasy_spoon: {
    id: 'the_greasy_spoon', label: 'The Greasy Spoon', cuisine: 'Diner',
    blurb: 'Fluorescent lights, sticky menus, and coffee that has been on the burner since 1979.',
    service: '24h', deliveryFeeBase: 2, prepMinutes: 12, hours: [0, 1410],
    menu: [
      { itemId: 'dish_diner_breakfast', price: 10 },
      { itemId: 'dish_club_sandwich', price: 12 },
      { itemId: 'dish_patty_melt', price: 13 },
      { itemId: 'dish_grilled_cheese', price: 8 },
      { itemId: 'dish_tomato_soup_cup', price: 5 },
      { itemId: 'dish_chicken_tenders', price: 11 },
      { itemId: 'dish_hamburger_steak', price: 14 },
      { itemId: 'dish_pancake_plate', price: 9 },
      { itemId: 'dish_pie_slice', price: 6 },
      { itemId: 'dish_coffee_mug', price: 3 },
      { itemId: 'dish_vanilla_shake', price: 6 },
      { itemId: 'dish_onion_soup', price: 7 },
    ],
  },
  golden_wok: {
    id: 'golden_wok', label: 'Golden Wok', cuisine: 'Chinese',
    blurb: 'Takeout cartons, chili oil, and a wok that has never once been off the heat.',
    service: 'dinner', deliveryFeeBase: 3, prepMinutes: 20, hours: [660, 1380],
    menu: [
      { itemId: 'dish_kung_pao', price: 14 },
      { itemId: 'dish_chow_mein', price: 13 },
      { itemId: 'dish_dumplings', price: 9 },
      { itemId: 'dish_egg_rolls', price: 6 },
      { itemId: 'dish_orange_chicken', price: 15 },
      { itemId: 'dish_lo_mein', price: 12 },
      { itemId: 'dish_house_fried_rice', price: 13 },
      { itemId: 'dish_beef_broccoli', price: 14 },
      { itemId: 'dish_wonton_soup', price: 8 },
      { itemId: 'dish_fortune_cookies', price: 4 },
    ],
  },
  sals_pizzeria: {
    id: 'sals_pizzeria', label: "Sal's Pizzeria", cuisine: 'Italian',
    blurb: 'A whole pie in a box that barely fits through the door. Sal does not do half-portions.',
    service: 'late', deliveryFeeBase: 4, prepMinutes: 30, hours: [660, 1410],
    menu: [
      { itemId: 'dish_pepperoni_pizza', price: 19 },
      { itemId: 'dish_calzone', price: 15 },
      { itemId: 'dish_garlic_knots', price: 7 },
      { itemId: 'dish_cheese_pizza', price: 16 },
      { itemId: 'dish_sausage_pizza', price: 18 },
      { itemId: 'dish_white_pizza', price: 17 },
      { itemId: 'dish_meatball_sub', price: 13 },
      { itemId: 'dish_breadsticks', price: 6 },
      { itemId: 'dish_caesar_wedge', price: 9 },
      { itemId: 'dish_cannoli', price: 8 },
      { itemId: 'dish_limonata', price: 5 },
    ],
  },
  el_camino: {
    id: 'el_camino', label: 'El Camino Taqueria', cuisine: 'Mexican',
    blurb: 'Foil-wrapped, cheap, and enormous. The salsa comes in a container that always leaks.',
    service: 'late', deliveryFeeBase: 3, prepMinutes: 18, hours: [630, 1380],
    menu: [
      { itemId: 'dish_al_pastor', price: 12 },
      { itemId: 'dish_burrito', price: 14 },
      { itemId: 'dish_chips_guac', price: 8 },
      { itemId: 'dish_carnitas_tacos', price: 12 },
      { itemId: 'dish_chorizo_tacos', price: 13 },
      { itemId: 'dish_quesadilla', price: 11 },
      { itemId: 'dish_tamales', price: 10 },
      { itemId: 'dish_elote', price: 6 },
      { itemId: 'dish_sopes', price: 9 },
      { itemId: 'dish_horchata', price: 5 },
      { itemId: 'dish_bean_cheese_burrito', price: 10 },
    ],
  },
  bangkok_house: {
    id: 'bangkok_house', label: 'Bangkok House', cuisine: 'Thai',
    blurb: 'Asks how spicy you want it and then ignores the answer.',
    service: 'dinner', deliveryFeeBase: 4, prepMinutes: 25, hours: [660, 1320],
    menu: [
      { itemId: 'dish_pad_thai', price: 15 },
      { itemId: 'dish_green_curry', price: 16 },
      { itemId: 'dish_spring_rolls', price: 7 },
      { itemId: 'dish_drunken_noodles', price: 15 },
      { itemId: 'dish_massaman_curry', price: 17 },
      { itemId: 'dish_thai_fried_rice', price: 13 },
      { itemId: 'dish_tom_yum', price: 9 },
      { itemId: 'dish_satay', price: 11 },
      { itemId: 'dish_thai_iced_tea', price: 5 },
      { itemId: 'dish_mango_sticky_rice', price: 9 },
      { itemId: 'dish_coconut_ice_cream', price: 7 },
    ],
  },
  kaisen_sushi: {
    id: 'kaisen_sushi', label: 'Kaisen Sushi', cuisine: 'Japanese',
    blurb: 'The expensive one. Everything comes in a lacquered box and travels badly.',
    service: 'dinner', deliveryFeeBase: 6, prepMinutes: 35, hours: [690, 1290],
    menu: [
      { itemId: 'dish_salmon_roll', price: 24 },
      { itemId: 'dish_tempura_udon', price: 18 },
      { itemId: 'dish_miso_soup', price: 5 },
      { itemId: 'dish_spicy_tuna_roll', price: 22 },
      { itemId: 'dish_rainbow_roll', price: 28 },
      { itemId: 'dish_ebi_tempura', price: 16 },
      { itemId: 'dish_chicken_katsu', price: 17 },
      { itemId: 'dish_gyoza', price: 11 },
      { itemId: 'dish_edamame', price: 6 },
      { itemId: 'dish_green_tea', price: 4 },
      { itemId: 'dish_mochi', price: 8 },
    ],
  },
  emerald_kitchen: {
    id: 'emerald_kitchen', label: 'Emerald Kitchen', cuisine: 'Upscale',
    blurb: 'White tablecloths, a sommelier who raises one eyebrow, and prices that quietly exclude you.',
    service: 'dinner', deliveryFeeBase: 8, prepMinutes: 30, hours: [1020, 1380],
    menu: [
      { itemId: 'dish_ribeye', price: 38 },
      { itemId: 'dish_duck_breast', price: 34 },
      { itemId: 'dish_short_rib', price: 36 },
      { itemId: 'dish_caesar_salad', price: 12 },
      { itemId: 'dish_butter_potatoes', price: 10 },
      { itemId: 'dish_creme_brulee', price: 9 },
      { itemId: 'dish_chocolate_torte', price: 10 },
      { itemId: 'dish_house_red', price: 14 },
      { itemId: 'dish_espresso', price: 6 },
    ],
  },
  midnight_noodle: {
    id: 'midnight_noodle', label: 'Midnight Noodle', cuisine: 'Asian',
    blurb: 'Steam rolling off the broth at 2am. The last good decision you will make tonight.',
    service: 'late', deliveryFeeBase: 4, prepMinutes: 18, hours: [1020, 240],
    menu: [
      { itemId: 'dish_tonkotsu_ramen', price: 16 },
      { itemId: 'dish_dan_dan', price: 14 },
      { itemId: 'dish_spicy_wontons', price: 10 },
      { itemId: 'dish_garlic_fried_rice', price: 12 },
      { itemId: 'dish_chashu_bowl', price: 15 },
      { itemId: 'dish_egg_ramen', price: 11 },
      { itemId: 'dish_gyoza_night', price: 10 },
      { itemId: 'dish_boba_milk_tea', price: 7 },
      { itemId: 'dish_cucumber_salad', price: 6 },
    ],
  },
  latenight_munchies: {
    id: 'latenight_munchies', label: 'Latenight Munchies', cuisine: 'Street food',
    blurb: 'Anything battered and fried, served to people who smell like regret and victory.',
    service: 'late', deliveryFeeBase: 3, prepMinutes: 12, hours: [1080, 300],
    menu: [
      { itemId: 'dish_loaded_nachos', price: 11 },
      { itemId: 'dish_buffalo_wings', price: 13 },
      { itemId: 'dish_chili_cheese_tots', price: 9 },
      { itemId: 'dish_hot_dog', price: 7 },
      { itemId: 'dish_mozzarella_sticks', price: 8 },
      { itemId: 'dish_poutine', price: 12 },
      { itemId: 'dish_fried_pickles', price: 7 },
      { itemId: 'dish_cheesesteak', price: 14 },
      { itemId: 'dish_freezie', price: 5 },
    ],
  },
};
const RESTAURANT_DEFS_LIST = Object.values(RESTAURANT_DEFS);
// Every itemId any restaurant sells, derived once (food-overhaul Phase 8,
// D21) — the recipe website's unlock-on-taste hook and RECIPE_CARDS both
// need "is this defId a dish someone could taste and discover" without
// hand-maintaining a second list that could drift from the menus above.
const RESTAURANT_DISH_IDS = new Set(RESTAURANT_DEFS_LIST.flatMap(r => r.menu.map(m => m.itemId)));

// --- Escorts (external-world plan Phase 7) ---
// The à la carte catalogue. Each service has its own rate (on top of the
// escort's base) and its own visit length in ticks; `requiresContentFlag`
// gates the mature ones behind CONTENT_CONFIG's 'mature' flag the same way
// AfterHours is gated — an escort's advertised set is filtered at render,
// and bookEscort re-checks authoritatively. `company`/`dinner` are the
// always-available, non-gated floor every escort's menu must include (so a
// roster is never empty when the mature flag is off).
const ESCORT_SERVICE_DEFS = {
  company: {
    id: 'company', label: 'Companionship', rate: 120, durationTicks: 4,
    desc: 'Conversation, a drink, an evening that isn\u2019t quiet.',
  },
  dinner: {
    id: 'dinner', label: 'Dinner Date', rate: 160, durationTicks: 4,
    desc: 'A real meal out, or they cook \u2014 a night that reads as a date.',
  },
  massage: {
    id: 'massage', label: 'Massage', rate: 200, durationTicks: 3,
    requiresContentFlag: 'mature',
    desc: 'Lotion, hands, and an hour that exists to unwind.',
  },
  gfe: {
    id: 'gfe', label: 'Girlfriend Experience', rate: 280, durationTicks: 4,
    requiresContentFlag: 'mature',
    desc: 'Affection and intimacy, the full boyfriend-for-the-evening treatment.',
  },
  full: {
    id: 'full', label: 'Full Service', rate: 420, durationTicks: 4,
    requiresContentFlag: 'mature',
    desc: 'Everything on the menu. No exceptions, no surprises.',
  },
  overnight: {
    id: 'overnight', label: 'Overnight', rate: 900, durationTicks: 8,
    requiresContentFlag: 'mature',
    desc: 'From late evening through breakfast. The whole night.',
  },
};
const ESCORT_SERVICE_DEFS_LIST = Object.values(ESCORT_SERVICE_DEFS);

// Deterministic per-roster-slot menu rotation (decision 14: two escorts have
// genuinely different menus). Six distinct subsets of the six services; each
// includes at least one non-mature service (company/dinner) so the checklist
// is never empty under any content-flag setting. ensureEscortRoster (SIM)
// assigns slot i this rotation, so roster and menu are both seed-stable.
const ESCORT_OFFERED_ROTATION = [
  ['company', 'dinner', 'massage', 'gfe'],
  ['company', 'dinner', 'gfe', 'full'],
  ['company', 'massage', 'full', 'overnight'],
  ['dinner', 'massage', 'gfe', 'overnight'],
  ['company', 'dinner', 'massage', 'full'],
  ['company', 'gfe', 'full', 'overnight'],
];

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
