// ===== SECTION: AFTERHOURS — blended content layer (Phase 1) =====
// Two real sources, one seamless feed. Pornhub (webmasters API, JSON) is
// fetched via root.superFetch; Eporner (API v2, JSON) via PLAIN browser
// fetch — its anti-bot wall blocks every proxy path, so the superFetch
// route is banned for it and vice versa (see src/ref/complete/afterhours-redesign-plan.md).
//
// Since Phase 2 this file also ships the full routed mini-site: the router
// (browser.afterHoursView = { view, params, stack }), the site header with
// its fake address bar and internal back/forward, the footer, the 404 view,
// the skeleton grid, and EVERY AfterHours renderer + handler (they
// relocated here from RENDER.COMPUTER / UI.COMPUTER — renderAfterHours in
// RENDER.COMPUTER is now a one-line delegate to AH.render, so the phone's
// shared-renderer path is untouched). Load position (after UI.COMPUTER,
// before UI.WINDOWMANAGER) is unchanged; nothing here is referenced at
// load time by earlier scripts — they call into AH_* only from runtime
// handlers, after every script tag has finished loading.
//
// Normalized clip shape (data model, src/ref/complete/afterhours-redesign-plan.md):
//   { id: 'ph:<videoId>'|'ep:<videoId>', sources: ['ph']|['ph','ep'],
//     sourceVideoId, title, duration (display), durationSec, views, rating,
//     thumb, embedUrls: { ph?, ep? }, watchUrls: { ph?, ep? }, category,
//     keywords: [...], addedDaysAgo: number|null }

// --- Parsing helpers ---
function parseDuration(strOrNum) {
  // Accepts "MM:SS", "H:MM:SS", or a raw number of seconds.
  const s = String(strOrNum == null ? '' : strOrNum).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(':').map(p => parseInt(p, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// Views arrive as numbers (both APIs today) but are defensively parsed as
// possibly-formatted strings ("1.2M", "45,678") — the APIs have returned
// either over the years.
function parseCount(s) {
  const str = String(s == null ? '' : s).trim();
  const m = str.match(/^([\d.,]+)\s*([kmb]?)/i);
  if (!m) return Number(str) || 0;
  const num = parseFloat(m[1].replace(/,/g, ''));
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()] || 1;
  return Math.round(num * mult);
}

// Both APIs date their uploads as "YYYY-MM-DD HH:MM:SS" — a datetime
// string, not an epoch. Space → T so Date.parse works in every engine.
function parseDaysAgo(dateStr) {
  if (!dateStr) return null;
  const t = Date.parse(String(dateStr).trim().replace(' ', 'T'));
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

// --- Title normalization for cross-post dedup ---
// Both sites carry the same studio productions; Eporner titles often
// prefix the studio ("[Brazzers] ..." or "Brazzers: ..."). Normalization
// strips the common prefixes/fillers so an identical underlying title
// matches exactly (then duration ±10% confirms the cross-post).
const AH_STUDIO_PREFIXES = [
  'brazzers', 'realitykings', 'bangbros', 'naughty america', 'vixen',
  'blacked', 'blackedraw', 'tushy', 'tushyraw', 'team skeet', 'milf hunter',
  'evil angel', 'digital playground', 'nubiles', 'jules jordan',
  'sxestudios', 'badoink', 'mofos', 'kink', 'czechav', 'fake agent',
  'slayed', 'deeper', 'fitshlicker', 'archangel',
];

function normalizeTitle(s) {
  let t = String(s || '').toLowerCase().trim();
  // Strip leading bracketed groups, e.g. "[Brazzers]" / "[HD]".
  t = t.replace(/^(\[[^\]]*\]\s*)+/, '');
  // Strip a leading studio name followed by a separator.
  for (const st of AH_STUDIO_PREFIXES) {
    if (t.startsWith(st)) {
      t = t.slice(st.length).replace(/^[\s:\-–—|.]+/, '');
      break;
    }
  }
  // Strip trailing filler words.
  t = t.replace(/\s*(hd|full hd|4k|full movie|porn video|xxx)\s*$/, '');
  return t.replace(/\s+/g, ' ').trim();
}

// Title words → keyword tags (Eporner has real keywords; Pornhub doesn't,
// so its title feeds the related rail instead).
const AH_TITLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'of', 'to', 'for', 'with',
  'her', 'his', 'their', 'my', 'your', 'you', 'step', 'vs', 'hd', '4k',
  'xxx', 'porn', 'video', 'sex', 'fucking', 'fuck', 'cum', 'cock', 'girl',
  'girls', 'guy', 'guys', 'man', 'woman', 'from', 'into',
]);

function titleKeywords(title) {
  return String(title || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !AH_TITLE_STOPWORDS.has(w))
    .slice(0, 8);
}

// --- Normalization: API video → normalized clip ---
function normalizePhVideo(v) {
  const videoId = v.url?.match(/viewkey=([a-z0-9]+)/)?.[1] || v.video_id;
  if (!videoId) return null;
  // Prefer JPG/PNG thumbs from pix-fl/pix-ei CDNs; pix-cdn77 returns MP4
  // preview clips that can't render as <img> elements (verified live).
  const allThumbs = [v.default_thumb, v.thumb, ...(v.thumbs?.map(t => t.src) || [])].filter(Boolean);
  const thumb = allThumbs.find(u => !u.includes('pix-cdn77')) || allThumbs[0] || '';
  return {
    id: `ph:${videoId}`,
    source: 'ph',
    sources: ['ph'],
    sourceVideoId: videoId,
    title: v.title,
    duration: v.duration,
    durationSec: parseDuration(v.duration),
    views: parseCount(v.views),
    rating: parseFloat(v.rating) || 0,
    thumb,
    embedUrls: { ph: `https://www.pornhub.com/embed/${videoId}` },
    watchUrls: { ph: v.url || `https://www.pornhub.com/view_video.php?viewkey=${videoId}` },
    // The webmasters API returns publish_date as "YYYY-MM-DD HH:MM:SS"
    // (verified live 2026-08-05 — the plan's "no date field" note is
    // stale); null only if it's absent/unparseable. See Handoff.
    addedDaysAgo: parseDaysAgo(v.publish_date),
    keywords: titleKeywords(v.title),
  };
}

function normalizeEpVideo(v) {
  const id = v.id;
  if (!id) return null;
  // thumbsize=medium returns an array of medium thumb objects plus a
  // default_thumb object — all { ..., src } shapes.
  const thumbs = [
    v.thumbs?.[0]?.src,
    v.default_thumb?.src,
    v.thumbs?.find(t => t.size === 'large')?.src,
  ].filter(Boolean);
  const keywords = Array.isArray(v.keywords)
    ? v.keywords.map(k => String(k).trim()).filter(Boolean)
    : String(v.keywords || '').split(',').map(k => k.trim()).filter(Boolean);
  return {
    id: `ep:${id}`,
    source: 'ep',
    sources: ['ep'],
    sourceVideoId: id,
    title: v.title,
    // length_min is the display string ("120:08"); length_sec backs the
    // dedup/related math. Fall back to formatting when length_min is absent.
    duration: v.length_min || formatDuration(parseDuration(v.length_sec)),
    durationSec: parseDuration(v.length_sec),
    views: parseCount(v.views),
    // Eporner rates on a 0-5 scale; normalize to the 0-100 the card meta
    // already displays (PH is already a percentage).
    rating: Math.round((parseFloat(v.rate) || 0) * 20),
    thumb: thumbs[0] || '',
    embedUrls: { ep: v.embed || `https://www.eporner.com/embed/${id}` },
    watchUrls: { ep: v.url || `https://www.eporner.com/${id}` },
    addedDaysAgo: parseDaysAgo(v.added),
    keywords: keywords.slice(0, 12),
  };
}

// --- Blend: dedup cross-posts, then round-robin interleave ---
// A clip carried by both sites (normalized title equal AND duration within
// ±AH_TUNING.dedupDurationTolerance) collapses into ONE card with
// sources ['ph','ep'] and both hosts' embeds, so the player page can pick
// which host to play. Merged cards keep the PH entry's feed position (PH
// is the primary host in the blended id scheme), and whatever doesn't
// cross-post stays in its own source's bucket for interleaving.
function blendResults({ ph = [], ep = [] } = {}) {
  const phBucket = [];
  const epLeft = [];
  const epPool = [...ep];

  const durationTolerance = (a, b) => Math.max(
    5,
    ((a || 0) + (b || 0)) / 2 * AH_TUNING.dedupDurationTolerance,
  );

  for (const phClip of ph) {
    let matchIdx = -1;
    for (let i = 0; i < epPool.length; i++) {
      const epClip = epPool[i];
      if (Math.abs((phClip.durationSec || 0) - (epClip.durationSec || 0)) <= durationTolerance(phClip.durationSec, epClip.durationSec)
          && normalizeTitle(phClip.title) === normalizeTitle(epClip.title)) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx >= 0) {
      const epClip = epPool.splice(matchIdx, 1)[0];
      phBucket.push({
        ...phClip,
        sources: ['ph', 'ep'],
        embedUrls: { ph: phClip.embedUrls.ph, ep: epClip.embedUrls.ep },
        watchUrls: { ph: phClip.watchUrls.ph, ep: epClip.watchUrls.ep },
        thumb: phClip.thumb || epClip.thumb,
        addedDaysAgo: phClip.addedDaysAgo,
        keywords: [...(phClip.keywords || []), ...(epClip.keywords || [])].slice(0, 12),
      });
    } else {
      phBucket.push(phClip);
    }
  }
  epLeft.push(...epPool);

  return interleaveBlend(phBucket, epLeft);
}

// Round-robin interleave with a hard run cap (AH_TUNING.maxConsecutiveSameSource
// = 2) so the feed reads as one site rather than two blocks stapled
// together. Pick rule: the source with MORE clips remaining leads (ties go
// to PH), and once a source's run hits the cap the OTHER source is forced
// — which is exactly what keeps e.g. 6 PH + 2 EP from ending in a 3-run
// (the smaller source is held in reserve as a separator instead of being
// alternated away up front). Only when one source is exhausted does the
// survivor run on, and a long tail there is unavoidable in that case (the
// plan's ≥2 source guarantee is for feeds where both sources contribute).
function interleaveBlend(phBucket, epBucket) {
  const cap = AH_TUNING.maxConsecutiveSameSource;
  const out = [];
  let pi = 0, ei = 0;
  let runSrc = null, runLen = 0;
  while (pi < phBucket.length || ei < epBucket.length) {
    let takePh;
    if (pi >= phBucket.length) takePh = false;
    else if (ei >= epBucket.length) takePh = true;
    else if (runSrc === 'ph' && runLen >= cap) takePh = false;
    else if (runSrc === 'ep' && runLen >= cap) takePh = true;
    else takePh = (phBucket.length - pi) >= (epBucket.length - ei);
    if (takePh) {
      out.push(phBucket[pi++]);
      runLen = runSrc === 'ph' ? runLen + 1 : 1;
      runSrc = 'ph';
    } else {
      out.push(epBucket[ei++]);
      runLen = runSrc === 'ep' ? runLen + 1 : 1;
      runSrc = 'ep';
    }
  }
  return out;
}

// Bound any provider call so a hung request (a stalled fetch never resolving)
// settles into a rejection instead of hanging its whole pipeline forever —
// per-source degradation treats it as an empty bucket (see AH_SOURCES).
function AH_fetchWithTimeout(doFetch, ms) {
  let timer;
  const cap = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('afterhours: provider search timed out')), ms);
  });
  return Promise.race([doFetch(), cap]).finally(() => clearTimeout(timer));
}

// --- Source adapters ---
// Each returns { videos: [normalizedClip], totalPages }. Degradation is per
// source: a rejection just surfaces as an empty bucket to blendResults.
const AH_SOURCES = {
  ph: {
    name: 'Pornhub',
    badge: 'PH',
    async search(q, page) {
      const search = (q || '').trim();
      let url = `https://www.pornhub.com/webmasters/search?thumbsize=medium&page=${page}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      const j = await AH_fetchWithTimeout(async () => {
        const r = await root.superFetch(url);
        return r.json();
      }, AH_TUNING.searchTimeoutMs);
      const videos = j.videos || [];
      return {
        videos: videos.map(normalizePhVideo).filter(Boolean),
        totalPages: Math.max(1, j.totalPages || (videos.length ? page + 1 : page)),
      };
    },
  },
  ep: {
    name: 'Eporner',
    badge: 'EP',
    async search(q, page) {
      // Direct browser fetch ONLY — every proxy path (superFetch, fetch_url)
      // hits Eporner's anti-bot HTML challenge wall.
      const search = (q || '').trim();
      let url = `https://www.eporner.com/api/v2/video/search/?per_page=${AH_TUNING.perPage}&page=${page}&format=json&thumbsize=medium&order=latest`;
      if (search) url += `&query=${encodeURIComponent(search)}`;
      const j = await AH_fetchWithTimeout(async () => {
        const r = await fetch(url);
        return r.json();
      }, AH_TUNING.searchTimeoutMs);
      const videos = j.videos || [];
      return {
        videos: videos.map(normalizeEpVideo).filter(Boolean),
        totalPages: Math.max(1, j.total_pages || (videos.length ? page + 1 : page)),
      };
    },
  },
};

// ===== SECTION: AFTERHOURS — routed mini-site shell (Phase 2) =====
// AfterHours is a routed mini-site inside the sim's browser. The sim's own
// Back/Forward (computer.js browserGoBack/Forward + renderBrowserNav) still
// moves between SITES; the site header's back/forward move WITHIN AfterHours
// via browser.afterHoursView = { view, params, stack } (defaultComputerState,
// computer.js; old saves lazy-init via AH_ensureState below). The address
// bar is fake chrome: it shows afterhours.example/<route> and typing a route
// navigates the site; gibberish lands on the 404 view with a "Back to Home"
// link.
//
// Determinism (Locked decision 6/11): every site-generated string derives
// from seededRng(afterHoursSeed, 'afterhours') where afterHoursSeed is the
// save's meta.seed — stable across re-renders/reloads within a save,
// different across saves. No Math.random anywhere the chrome could drift.
//
// Views today: home (a page of discovery rows — Phase 4), category / search
// (the one blended browse grid, search with its filter row), player (the
// relocated watch panel, masturbate/cum/session controls intact — Phase 3
// builds it out), and 404. Later phases register history / liked /
// hotsingles / hot-single here.

const AH_VIEWS = {
  home: AH_renderHome,
  category: AH_renderBrowse,
  search: AH_renderBrowse,
  player: AH_renderPlayer,
  hotsingles: AH_renderHotSingles,
  'hot-single': AH_renderHotSingle,
  '404': AH_renderNotFound,
};

// Exposed to other scripts: renderAfterHours (RENDER.COMPUTER) delegates to
// AH.render so both devices render the SAME site through the shared
// COMPUTER_RENDERERS['article'] path; doBrowserVisit (UI.COMPUTER) calls
// AH.onSiteOpen to resume/init the routed view + kick the first fetch.
const AH = {
  render: AH_render,
  onSiteOpen: AH_onSiteOpen,
};

// --- Session caches (module-level, never persisted) ---
// These three are FETCH STATE, not durable data: the home/tile row results,
// the per-clip related rows, and the snapshots of what was watched this page
// session. They used to live on the browser app object, which state.js writes
// wholesale (`queueWrite('world', 'computer', ...)`) — so a home visit alone
// pushed ~390 full clip records into the save, and a fetch interrupted
// mid-flight persisted its 'fetching' entry into the NEXT session, where the
// kick guard read it as in-flight and left that row on skeletons forever.
// Both problems are the same problem: a session cache stored in durable
// state. Holding them here fixes both at the root — a page load starts with
// empty objects, so there is nothing stale to purge and nothing to persist.
// (Durable watch data is world.afterHours — Phase 6 — and is unaffected.)
const AH_rowCache = {};          // `${sectionId}:${page}` → { status, clips, error, startedAt }
const AH_relatedCache = {};      // clipId → { status, rows, error, startedAt }
const AH_watchedSnapshots = {};  // clipId → AH_clipSnapshot
const AH_watchedStack = [];      // clipIds, most-recent-first (the snapshot prune key)

// Drop every cached row (a category change invalidates the home rows).
function AH_clearRowCache() {
  for (const key of Object.keys(AH_rowCache)) delete AH_rowCache[key];
}

// --- Routed state (lazy-init, mirrors the world.phone pattern) ---
// normalizeComputerState deep-merges per-app but the browser object itself
// replaces fresh defaults on old saves, so afterHoursView/afterHoursSeed are
// absent until the AH module backfills them here (idempotent).
// One-shot legacy migration (Phase 6): pre-Phase 6 saves kept likes in
// browser.afterHoursLiked (persisted via the wholesale world.computer
// write). The first ensureState copies them into world.afterHours.liked and
// DELETES the legacy source so the migration can never re-run after the
// player unlikes everything. Belt-and-braces flag anyway.
let AH_legacyLikesMigrated = false;
function AH_ensureState(gs) {
  const browser = gs?.world?.computer?.apps?.browser;
  if (!browser) return;
  if (!browser.afterHoursView || typeof browser.afterHoursView !== 'object') {
    browser.afterHoursView = { view: 'home', params: {}, stack: [] };
  }
  if (!Array.isArray(browser.afterHoursView.stack)) browser.afterHoursView.stack = [];
  if (!browser.afterHoursView.view) browser.afterHoursView.view = 'home';
  if (!browser.afterHoursView.params || typeof browser.afterHoursView.params !== 'object') browser.afterHoursView.params = {};
  if (!browser.afterHoursSeed) {
    browser.afterHoursSeed = String(gs?.meta?.seed || 'afterhours');
  }
  // Phase 6: the durable site data lives in world.afterHours — a world
  // sub-key (persisted by state.js like world.phone), NOT the browser
  // object, so history/liked/searchHistory/continueWatching survive
  // reloads. Lazy-init for old saves; the legacy browser.afterHoursLiked
  // store (persisted via the wholesale world.computer write) is migrated
  // once into world.afterHours.liked and dropped.
  if (gs?.world) gs.world.afterHours = gs.world.afterHours || defaultAfterHoursState();
  const ah = gs?.world?.afterHours;
  if (ah && browser.afterHoursLiked && typeof browser.afterHoursLiked === 'object') {
    const legacyEntries = Object.values(browser.afterHoursLiked).filter(r => r && r.clipId);
    if (legacyEntries.length && !ah.liked.length && !AH_legacyLikesMigrated) {
      AH_legacyLikesMigrated = true;
      const day = gs.meta?.clock?.day ?? 1;
      for (const rec of legacyEntries) {
        ah.liked.push(Object.assign({}, rec, { day }));
      }
      if (ah.liked.length > AH_TUNING.likedCap) ah.liked.length = AH_TUNING.likedCap;
      delete browser.afterHoursLiked;
    }
  }
  // The search view's active filters are real (small, durable) app state.
  if (!browser.afterHoursFilter || typeof browser.afterHoursFilter !== 'object') browser.afterHoursFilter = { sort: 'relevance', source: 'all' };
  // One-shot cleanup: the row/related/snapshot caches used to live on this
  // object and were written into the save wholesale with it (hundreds of clip
  // records per home visit). They are module-level session state now — drop
  // whatever an older build left behind so the save actually sheds the bulk.
  delete browser.afterHoursCache;
  delete browser.afterHoursRelatedCache;
  delete browser.afterHoursWatchedSnapshots;
  delete browser.afterHoursWatchedStack;
}

// PRNG for all site-generated chrome. A fresh instance per call is fine —
// the same seed always yields the same sequence, so re-renders can never
// drift it.
function AH_seedRng(gs) {
  const browser = gs?.world?.computer?.apps?.browser;
  return seededRng(browser?.afterHoursSeed || String(gs?.meta?.seed || 'afterhours'), 'afterhours');
}

// --- Seed-derived branding (Phase 2: the tagline; later phases add the ad
// rotation offset, ticker baseline, comment pools, etc.) ---
const AH_TAGLINES = [
  "The internet's best late-night entertainment",
  'More videos than one apartment can handle',
  'The hottest videos on the web',
  'Endless entertainment, dial-up friendly',
  'Your nightly destination since 2006',
  'Faster than your modem, louder than your neighbors',
  'The best videos. Guaranteed.',
];

function AH_tagline(gs) {
  const pool = AH_TAGLINES;
  return pool[Math.floor(AH_seedRng(gs)() * pool.length)];
}

// --- Fake address-bar routing ---
function AH_routePath(view, params) {
  const route = AH_TUNING.routes[view];
  const p = params || {};
  switch (view) {
    case 'category': return `category/${encodeURIComponent(p.catId || 'featured')}`;
    case 'search': return `search?q=${encodeURIComponent(p.query || '')}`;
    case 'player': return `watch/${encodeURIComponent(p.clipId || '')}`;
    case 'hotsingles': return 'hotsingles';
    case 'hot-single': return `hot-single/${encodeURIComponent(p.npcId || '')}`;
    case '404': return p.url || 'not-found';
    default: return route?.path || '';
  }
}

function AH_routeUrl(view, params) {
  const path = AH_routePath(view, params);
  return path ? `afterhours.example/${path}` : 'afterhours.example/';
}

// Turn whatever the player typed in the address bar into a route. Only the
// site's own routes resolve; anything else is a 404.
function AH_parseRoute(typed) {
  let t = String(typed || '').trim().replace(/^https?:\/\//i, '');
  if (t.startsWith('afterhours.example')) t = t.slice('afterhours.example'.length);
  t = t.replace(/^\/+/, '');
  if (!t || t === 'home' || t === 'index' || t === 'index.html') return { view: 'home', params: {} };
  const qIdx = t.indexOf('?');
  const path = qIdx >= 0 ? t.slice(0, qIdx) : t;
  const queryStr = qIdx >= 0 ? t.slice(qIdx + 1) : '';
  const parts = path.split('/').filter(Boolean).map(s => {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  });
  const first = (parts[0] || '').toLowerCase();
  if (first === 'category' && parts[1]) return { view: 'category', params: { catId: parts[1] } };
  if (first === 'watch' && parts[1]) return { view: 'player', params: { clipId: parts[1] } };
  if (first === 'hotsingles') return { view: 'hotsingles', params: {} };
  if (first === 'hot-single' && parts[1]) return { view: 'hot-single', params: { npcId: parts[1] } };
  if (first === 'search') {
    const qm = queryStr.match(/[?&]?q=([^&]*)/i);
    let q = '';
    if (qm) { try { q = decodeURIComponent(qm[1]); } catch (e) { q = qm[1]; } }
    return { view: 'search', params: { query: q } };
  }
  return { view: '404', params: { url: String(typed || '').trim() } };
}

// --- Router: the site's own internal back/forward ---
// browser.afterHoursView.stack is the site's full internal history; the
// current page is afterHoursView.view/params. ahNav appends, ahBack pops the
// boundary backwards, and a module-level AH_redoStack (ephemeral — real
// browsers don't persist forward stacks across tabs either) lets ahForward
// redo. Navigations to a browse view re-sync the clip cache identity and
// refetch only when what's cached doesn't match (so Back to a cached grid is
// instant).
const AH_redoStack = [];

function AH_sameParams(a, b) {
  const ka = Object.keys(a || {}).sort();
  const kb = Object.keys(b || {}).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if (String((a || {})[ka[i]]) !== String((b || {})[kb[i]])) return false;
  }
  return true;
}

function ahNav(view, params) {
  const gs = currentGameState;
  if (!gs) return;
  AH_ensureState(gs);
  const browser = gs.world.computer.apps.browser;
  const v = browser.afterHoursView;
  const next = params || {};
  if (v.view === view && AH_sameParams(v.params, next)) return; // self-nav is a no-op
  (v.stack || (v.stack = [])).push({ view: v.view, params: v.params || {} });
  if (v.stack.length > AH_TUNING.maxStack) v.stack.splice(0, v.stack.length - AH_TUNING.maxStack);
  v.view = view;
  v.params = next;
  // Navigating straight to a watch URL (address bar / share later) sets the
  // active clip id too — best effort: if it isn't in the current cache the
  // player view falls back to an unavailable state and Back re-syncs.
  if (view === 'player' && next.clipId) {
    browser.afterHoursWatching = next.clipId;
    // Kick the related-rows fetch (Up Next fill + the two blended rows).
    // Guarded by a cache status so re-navs/back-navs don't refetch.
    AH_kickRelatedFetch(gs, next.clipId);
  }
  AH_redoStack.length = 0;
  AH_syncBrowseView(gs, view, next);
}

// Landing on a view — by Back, Forward, or any other restore path — has to
// restore the state that view READS, not just the route. The player view
// renders from browser.afterHoursWatching, which AH_syncBrowseView nulls on
// every browse nav that changes identity; without re-deriving it from the
// restored params, going Back onto a player entry rendered "This video is no
// longer available" for a clip AH_findClip resolves perfectly well. ahNav
// does this inline for forward navigation — this is the same work for the
// history paths.
function AH_applyViewState(gs, view, params) {
  const p = params || {};
  if (view === 'player' && p.clipId) {
    gs.world.computer.apps.browser.afterHoursWatching = p.clipId;
    AH_kickRelatedFetch(gs, p.clipId);
  }
  AH_syncBrowseView(gs, view, p);
}

function ahBack() {
  const gs = currentGameState;
  if (!gs) return;
  AH_ensureState(gs);
  const v = gs.world.computer.apps.browser.afterHoursView;
  const stack = v.stack || [];
  if (!stack.length) return false;
  AH_redoStack.push({ view: v.view, params: v.params || {} });
  const prev = stack.pop();
  v.view = prev.view;
  v.params = prev.params || {};
  AH_applyViewState(gs, prev.view, prev.params || {});
  return true;
}

function ahForward() {
  const gs = currentGameState;
  if (!gs) return false;
  if (!AH_redoStack.length) return false;
  AH_ensureState(gs);
  const v = gs.world.computer.apps.browser.afterHoursView;
  (v.stack || (v.stack = [])).push({ view: v.view, params: v.params || {} });
  const next = AH_redoStack.pop();
  v.view = next.view;
  v.params = next.params || {};
  AH_applyViewState(gs, next.view, next.params || {});
  return true;
}

// A browse view owns a single slot of clips (browser.afterHoursClips), so
// only one browse identity can be cached at once. Landing on a browse view
// that doesn't match the cache resets the browse state to that identity and
// refetches; a match just renders what's there.
function AH_syncBrowseView(gs, view, params) {
  const browser = gs.world.computer.apps.browser;
  if (view !== 'home' && view !== 'category' && view !== 'search') return;
  let wantCat, wantQuery;
  if (view === 'category') {
    wantCat = params.catId || 'featured';
    wantQuery = '';
  } else if (view === 'search') {
    wantCat = browser.afterHoursCategory || 'featured';
    wantQuery = params.query || '';
  } else {
    wantCat = 'featured';
    wantQuery = '';
  }
  const cacheMatches = browser.afterHoursCategory === wantCat
    && browser.afterHoursSearchQuery === wantQuery
    && Array.isArray(browser.afterHoursClips);
  if (cacheMatches) return;
  browser.afterHoursCategory = wantCat;
  browser.afterHoursSearchQuery = wantQuery;
  // Leaving the browse identity behind must END an active session, not orphan
  // it. The only stop controls (Cum / Stop) render inside the player view, and
  // that view needs afterHoursWatching to resolve a clip before it renders
  // anything but the "no longer available" stub — so nulling the clip while a
  // session record survives leaves the player with no way to stop, and
  // reconcileTimeContext (TIME) keeps the 3x 'masturbating' frame alive off
  // the record alone. The address bar renders on every view, so this is
  // reachable straight from the player page.
  if (browser.afterHoursSession) {
    browser.afterHoursSession = null;
    popTimeContext();
    pendingInterruption = null;
  }
  browser.afterHoursWatching = null;
  browser.afterHoursClips = null;
  browser.afterHoursClipsLoading = false;
  browser.afterHoursClipsError = null;
  browser.afterHoursClipPage = 1;
  browser.afterHoursSourcePages = { ph: 1, ep: 1 };
  browser.afterHoursTotalPages = 1;
  // Home renders discovery rows (its own per-section cache), not the
  // blended grid — the carousel's featured section covers that feed, so
  // landing on home doesn't pay for a grid fetch nobody reads.
  if (view === 'home') return;
  fetchAfterHoursClips(wantCat);
}

// Re-render both shells after any site navigation/state change — the shared
// renderer means the phone gets the identical site.
function AH_refresh() {
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
}

// doBrowserVisit's AfterHours hook — resume whatever routed view the save
// was on and make sure the clip cache matches it. A persisted 'player' view
// resumes as-is (its clip may be gone; the renderer falls back to an
// unavailable state and Back re-syncs the grid).
function AH_onSiteOpen(gs) {
  AH_ensureState(gs);
  // Phase 5: (re)start the ad/ticker lifecycle interval — "started when
  // the site opens"; its tick self-clears when the site closes.
  AH_ensureLifecycle(gs);
  // Phase 7: the Hot Singles roster backstop for old saves — a save written
  // before Phase 7 has no world.hotSinglesRoster, so the first browse
  // pre-generates the six singles (idempotent, mirrors ensureEscortRoster's
  // first-browse backfill).
  ensureHotSinglesRoster(gs);
  const v = gs.world.computer.apps.browser.afterHoursView;
  if (v.view === 'player') {
    // Resumed mid-watch: kick the related-rows fetch so the rails
    // populate (best effort — if the clip is gone from the cache the
    // renderer falls back to the unavailable state and Back re-syncs).
    AH_kickRelatedFetch(gs, v.params?.clipId);
    return;
  }
  AH_syncBrowseView(gs, v.view || 'home', v.params || {});
}

// --- The site's shared render: header chrome, view, footer ---
// RENDER.COMPUTER's renderAfterHours is a one-line delegate to this, so both
// the computer window and the phone shell fill the same markup. Reads
// defensively (no state mutation from a render pass — AH_ensureState only
// runs from handlers/router paths).
//
// One sanctioned exception to "renders don't start work": the resume kick
// below. A reload while ON the player view has no handler (doBrowserVisit
// doesn't re-run on load), so the render pass is the only place that sees
// the unresolved clip. It is a one-shot per page-load, idempotent guard
// (missing entry → 'fetching' → 'done'), so it can never refetch or loop —
// it is not a timer and violates nothing in Locked decision 14.
let AH_resumeRelatedKicked = false;

function AH_resumeRelatedKick(gs) {
  if (AH_resumeRelatedKicked) return;
  const browser = gs?.world?.computer?.apps?.browser;
  const v = browser?.afterHoursView;
  if (v?.view !== 'player' || !v.params?.clipId) return;
  // The reload-resumed clip is usually not in the browse grid at all, so
  // resolve via AH_findClip — its world.afterHours fallback (history/liked/
  // continueWatching, all carrying their own embeds) is what makes a resumed
  // player page work; the grid cache alone would leave the rail empty.
  if (!AH_findClip(browser, v.params.clipId)) return;
  AH_resumeRelatedKicked = true;
  AH_kickRelatedFetch(gs, v.params.clipId);
}

function AH_render(body, gs, site) {
  const browser = gs.world.computer.apps.browser;
  const v = browser.afterHoursView || { view: 'home', params: {}, stack: [] };
  const view = AH_VIEWS[v.view] ? v.view : 'home';
  AH_resumeRelatedKick(gs);
  // Phase 5 lifecycle: the ad/ticker interval starts idempotently whenever
  // the site renders (this also covers Back/Forward/resume paths that never
  // run a handler) and self-clears on its own tick once the site is no
  // longer displayed. A guarded once-only start is not a render-scheduled
  // timer (Locked decision 14).
  AH_ensureLifecycle(gs);

  body.appendChild(renderBrowserNav(gs));
  body.appendChild(AH_renderSiteHeader(body, gs, site));

  if (view === 'home' || view === 'category' || view === 'search' || view === 'hotsingles' || view === 'hot-single') {
    body.appendChild(AH_renderCategoryBar(gs, site));
    body.appendChild(AH_renderSearchBar(gs));
    // Home is a page of discovery rows — no pagination bar. Search gains
    // its filter row (sort / source / inert duration chips); the page bar
    // belongs to the browse views only.
    if (view === 'search') body.appendChild(AH_renderSearchFilters(gs));
    if (view === 'category' || view === 'search') body.appendChild(AH_renderPageBar(gs));
    // Phase 5: a banner ad slot sits between the search chrome and the
    // content on every home/category/search view (the player page adds its
    // own banner + skyscraper). Rotates on the lifecycle timer.
    body.appendChild(AH_renderAdSlot('banner', gs));
  }

  AH_VIEWS[view](body, gs, site);

  body.appendChild(AH_renderFooter(gs));
}

function AH_renderSiteHeader(body, gs, site) {
  const browser = gs.world.computer.apps.browser;
  const v = browser.afterHoursView || { view: 'home', params: {}, stack: [] };

  const header = document.createElement('div');
  header.className = 'ah-site-header';

  const brand = document.createElement('button');
  brand.className = 'ah-brand';
  brand.title = 'Back to home';
  brand.addEventListener('click', () => { ahNav('home', {}); AH_refresh(); });
  const brandName = document.createElement('span');
  brandName.className = 'ah-brand-name';
  brandName.textContent = site.label;
  const brandTag = document.createElement('span');
  brandTag.className = 'ah-brand-tagline';
  brandTag.textContent = AH_tagline(gs);
  brand.appendChild(brandName);
  brand.appendChild(brandTag);
  header.appendChild(brand);

  const nav = document.createElement('div');
  nav.className = 'ah-site-nav';

  const backBtn = document.createElement('button');
  backBtn.className = 'ah-nav-btn';
  backBtn.textContent = '←';
  backBtn.title = 'Back';
  backBtn.disabled = !(v.stack || []).length;
  backBtn.addEventListener('click', () => { ahBack(); AH_refresh(); });
  nav.appendChild(backBtn);

  const fwdBtn = document.createElement('button');
  fwdBtn.className = 'ah-nav-btn';
  fwdBtn.textContent = '→';
  fwdBtn.title = 'Forward';
  fwdBtn.disabled = AH_redoStack.length === 0;
  fwdBtn.addEventListener('click', () => { ahForward(); AH_refresh(); });
  nav.appendChild(fwdBtn);

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'ah-nav-btn';
  refreshBtn.textContent = '↻';
  refreshBtn.title = 'Refresh';
  refreshBtn.addEventListener('click', () => { doAfterHoursReload(); });
  nav.appendChild(refreshBtn);

  const address = document.createElement('input');
  address.className = 'ah-addressbar';
  address.value = AH_routeUrl(v.view, v.params);
  address.spellcheck = false;
  address.setAttribute('aria-label', 'Address bar');
  address.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const route = AH_parseRoute(address.value);
      ahNav(route.view, route.params);
      AH_refresh();
    }
  });
  nav.appendChild(address);

  header.appendChild(nav);
  // Phase 5: the live "watching now" counter — one per shell, on every
  // view. Its text is mutated directly by the lifecycle timer; renders
  // only ever re-emit the current module value (never a re-derived one).
  header.appendChild(AH_renderTicker(gs));
  return header;
}

function AH_renderCategoryBar(gs, site) {
  const browser = gs.world.computer.apps.browser;
  const selectedCat = browser.afterHoursCategory || 'featured';
  const catBar = document.createElement('div');
  catBar.className = 'ah-category-bar';
  for (const cat of site.adultContent.categories) {
    const tab = document.createElement('button');
    tab.className = 'ah-cat-tab' + (cat.id === selectedCat ? ' active' : '');
    tab.setAttribute('data-action', 'browser.ah-category');
    tab.setAttribute('data-row-id', cat.id);
    tab.textContent = cat.label;
    catBar.appendChild(tab);
  }
  return catBar;
}

function AH_renderSearchBar(gs) {
  const browser = gs.world.computer.apps.browser;
  const searchBar = document.createElement('div');
  searchBar.className = 'ah-search-bar';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'ah-search-input';
  searchInput.placeholder = 'Search AfterHours...';
  searchInput.value = browser.afterHoursSearchQuery || '';
  searchBar.appendChild(searchInput);
  const searchBtn = document.createElement('button');
  searchBtn.className = 'btn tiny';
  searchBtn.textContent = 'Search';
  searchBtn.addEventListener('click', () => { doAfterHoursSearch(searchInput.value); });
  searchBar.appendChild(searchBtn);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doAfterHoursSearch(searchInput.value); }
  });
  if (browser.afterHoursSearchQuery) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary tiny';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Clear search';
    clearBtn.addEventListener('click', () => { searchInput.value = ''; doAfterHoursSearch(''); });
    searchBar.appendChild(clearBtn);
  }
  return searchBar;
}

// Search view filter row (Phase 4): client-side sort + source filter over
// the cached blended page, plus inert duration chips — neither API honors
// duration params, so they display as flavor and toast on click.
function AH_renderSearchFilters(gs) {
  const browser = gs.world.computer.apps.browser;
  const filter = browser.afterHoursFilter || { sort: 'relevance', source: 'all' };
  const row = document.createElement('div');
  row.className = 'ah-search-filters';

  const sortLabel = document.createElement('span');
  sortLabel.className = 'dim tiny';
  sortLabel.textContent = 'Sort:';
  row.appendChild(sortLabel);
  const sortSel = document.createElement('select');
  sortSel.className = 'ah-sort-select';
  for (const [value, label] of [['relevance', 'Relevance'], ['newest', 'Newest'], ['rated', 'Top rated']]) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = filter.sort === value;
    sortSel.appendChild(opt);
  }
  sortSel.addEventListener('change', () => {
    const f = browser.afterHoursFilter || (browser.afterHoursFilter = {});
    f.sort = sortSel.value;
    AH_refresh();
  });
  row.appendChild(sortSel);

  const srcLabel = document.createElement('span');
  srcLabel.className = 'dim tiny';
  srcLabel.textContent = 'Source:';
  row.appendChild(srcLabel);
  for (const [value, label] of [['all', 'All'], ['ph', 'PH'], ['ep', 'EP']]) {
    const chip = document.createElement('button');
    chip.className = 'ah-filter-chip' + (filter.source === value ? ' active' : '');
    chip.textContent = label;
    chip.addEventListener('click', () => {
      const f = browser.afterHoursFilter || (browser.afterHoursFilter = {});
      f.source = value;
      AH_refresh();
    });
    row.appendChild(chip);
  }

  const durLabel = document.createElement('span');
  durLabel.className = 'dim tiny';
  durLabel.textContent = 'Duration:';
  row.appendChild(durLabel);
  for (const label of ['<10 min', '10–30 min', '>30 min']) {
    const chip = document.createElement('button');
    chip.className = 'ah-filter-chip ah-filter-chip-inert';
    chip.textContent = label;
    chip.title = "Duration filters aren't supported";
    chip.addEventListener('click', () => AH_spawnToast("Duration filters aren't supported on this site yet."));
    row.appendChild(chip);
  }
  return row;
}

// The search view's sort/source filters applied to a clip list — a pure
// display transform over the cached blended page, never a mutation of it.
function AH_displayClips(browser, clips) {
  const filter = browser.afterHoursFilter || {};
  let out = Array.isArray(clips) ? clips.slice() : [];
  if (filter.source && filter.source !== 'all') {
    out = out.filter(c => (c.sources || []).includes(filter.source));
  }
  if (filter.sort === 'newest') {
    out.sort((a, b) => ((a.addedDaysAgo == null ? Infinity : a.addedDaysAgo) - (b.addedDaysAgo == null ? Infinity : b.addedDaysAgo)));
  } else if (filter.sort === 'rated') {
    out.sort((a, b) => ((b.rating || 0) - (a.rating || 0)));
  }
  return out;
}

function AH_renderPageBar(gs) {
  const browser = gs.world.computer.apps.browser;
  const refreshBar = document.createElement('div');
  refreshBar.className = 'ah-refresh-bar';
  const currentPage = browser.afterHoursClipPage || 1;
  if (currentPage > 1) {
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn-secondary tiny';
    prevBtn.setAttribute('data-action', 'browser.ah-page');
    prevBtn.setAttribute('data-direction', '-1');
    prevBtn.textContent = '◀ Prev';
    refreshBar.appendChild(prevBtn);
  }
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-secondary tiny ah-refresh-btn';
  nextBtn.setAttribute('data-action', 'browser.ah-refresh');
  nextBtn.textContent = '↻ Next Page';
  refreshBar.appendChild(nextBtn);
  const pageIndicator = document.createElement('span');
  pageIndicator.className = 'dim tiny';
  pageIndicator.textContent = `Page ${currentPage}`;
  refreshBar.appendChild(pageIndicator);
  if (browser.afterHoursClipsLoading) {
    const status = document.createElement('span');
    status.className = 'dim tiny';
    status.textContent = 'Loading clips...';
    refreshBar.appendChild(status);
  }
  return refreshBar;
}

// --- The homepage (Phase 4): a page of discovery rows, not a grid ---
// Every row is just another blended search (Locked decision 9), fetched by
// the fetchRow pipeline into the module-level AH_rowCache (keyed
// sectionId:page, cleared on category change). The renderer only READS it;
// missing
// rows are demanded by the guarded kick below (the same idempotent
// missing→'fetching'→'done' pattern as AH_resumeRelatedKick — never a
// timer, violates nothing in Locked decision 14).
function AH_renderHome(body, gs, site) {
  AH_kickHomeRows(gs);
  const sections = AH_TUNING.homeSections || [];
  const carousel = sections.find(s => s.type === 'carousel');
  if (carousel) body.appendChild(AH_renderCarouselSection(gs, carousel));
  body.appendChild(AH_renderContinueWatching(gs));
  // Phase 7: the campy "Hot Singles in your area" banner — the site's front
  // door to the deterministic singles roster.
  body.appendChild(AH_renderHotSinglesBanner(gs));
  body.appendChild(AH_renderCategoryTiles(gs, site));
  for (const section of sections) {
    if (section.type !== 'row') continue;
    body.appendChild(AH_renderRowSection(gs, section));
  }
}

function AH_renderRowHeader(label, count) {
  const header = document.createElement('div');
  header.className = 'ah-row-header';
  const h = document.createElement('h4');
  h.textContent = label;
  header.appendChild(h);
  if (count != null) {
    const size = document.createElement('span');
    size.className = 'dim tiny';
    size.textContent = `${count} videos`;
    header.appendChild(size);
  }
  return header;
}

function AH_renderCarouselSection(gs, section) {
  const browser = gs.world.computer.apps.browser;
  const entry = AH_rowCache[`${section.id}:1`];
  const wrap = document.createElement('div');
  wrap.className = 'ah-home-section';
  wrap.appendChild(AH_renderRowHeader(section.label, entry?.status === 'done' ? (entry.clips || []).length : null));
  const carousel = document.createElement('div');
  carousel.className = 'ah-carousel';
  if (!entry || entry.status !== 'done') {
    for (let i = 0; i < 5; i++) carousel.appendChild(AH_renderSkeletonCard());
  } else {
    for (const clip of (entry.clips || []).slice(0, section.rowSize || 10)) {
      carousel.appendChild(AH_renderClipCard(clip));
    }
  }
  wrap.appendChild(carousel);
  return wrap;
}

function AH_renderRowSection(gs, section) {
  const browser = gs.world.computer.apps.browser;
  const query = AH_sectionQuery(browser, section);
  if (section.derived && !query) {
    // No watch history to derive from yet — a real site nudges you to
    // build some. (Derived rows only kick when a query exists, so this
    // stays a placeholder, never a fetch.)
    const wrap = document.createElement('div');
    wrap.className = 'ah-home-section';
    wrap.appendChild(AH_renderRowHeader(section.label, null));
    const dim = document.createElement('p');
    dim.className = 'dim tiny ah-related-empty';
    dim.textContent = 'Watch a few videos and we\'ll recommend some.';
    wrap.appendChild(dim);
    return wrap;
  }
  const entry = AH_rowCache[`${section.id}:1`];
  const wrap = document.createElement('div');
  wrap.className = 'ah-home-section';
  wrap.appendChild(AH_renderRowHeader(section.label, entry?.status === 'done' ? (entry.clips || []).length : null));
  const row = document.createElement('div');
  row.className = 'ah-row';
  if (!entry || entry.status === 'fetching') {
    for (let i = 0; i < 6; i++) row.appendChild(AH_renderSkeletonCard());
  } else {
    const clips = (entry.clips || []).slice(0, section.rowSize || 12);
    if (!clips.length) {
      const dim = document.createElement('p');
      dim.className = 'dim tiny ah-related-empty';
      dim.textContent = entry.error || 'Nothing here yet.';
      row.appendChild(dim);
    } else {
      for (const clip of clips) row.appendChild(AH_renderClipCard(clip));
    }
  }
  wrap.appendChild(row);
  return wrap;
}

// Continue Watching (Phase 6): durable. The single continueWatching record
// first (the resume tile), then recent history — all rendered from stored
// snapshots normalized to clip shape, so cards survive the browse grid
// switching identity and reopen the player from their own embeds, offline
// of a fresh search.
function AH_renderContinueWatching(gs) {
  const ah = gs?.world?.afterHours;
  const clips = [];
  const seen = new Set();
  if (ah?.continueWatching) {
    clips.push(AH_recordToClip(ah.continueWatching));
    seen.add(ah.continueWatching.clipId);
  }
  for (const rec of (ah?.history || [])) {
    if (clips.length >= AH_TUNING.continueWatchingMax) break;
    if (seen.has(rec.clipId)) continue;
    seen.add(rec.clipId);
    clips.push(AH_recordToClip(rec));
  }
  if (!clips.length) return document.createDocumentFragment();
  const wrap = document.createElement('div');
  wrap.className = 'ah-home-section';
  wrap.appendChild(AH_renderRowHeader('Continue Watching', clips.length));
  const row = document.createElement('div');
  row.className = 'ah-row';
  for (const c of clips) row.appendChild(AH_renderClipCard(c));
  wrap.appendChild(row);
  return wrap;
}

// Category tiles with LIVE thumbs — each tile is its own cached mini-row
// (`cat:<catId>:1`), kicked by AH_kickHomeRows, so the first home visit
// fills them in progressively. Clicking a tile is a normal category nav.
function AH_renderCategoryTiles(gs, site) {
  const browser = gs.world.computer.apps.browser;
  const wrap = document.createElement('div');
  wrap.className = 'ah-home-section';
  wrap.appendChild(AH_renderRowHeader('Browse Categories', null));
  const grid = document.createElement('div');
  grid.className = 'ah-cat-tiles';
  for (const cat of site?.adultContent?.categories || []) {
    const entry = AH_rowCache[`cat:${cat.id}:1`];
    const tile = document.createElement('button');
    tile.className = 'ah-cat-tile' + (entry?.status === 'done' && entry.clips?.length ? '' : ' ah-cat-tile-empty');
    tile.setAttribute('data-action', 'browser.ah-category');
    tile.setAttribute('data-row-id', cat.id);
    if (entry?.status === 'done' && entry.clips?.length) {
      const img = document.createElement('img');
      img.src = entry.clips[0].thumb;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { img.style.display = 'none'; });
      tile.appendChild(img);
    }
    const label = document.createElement('span');
    label.className = 'ah-cat-tile-label';
    label.textContent = cat.label;
    tile.appendChild(label);
    grid.appendChild(tile);
  }
  wrap.appendChild(grid);
  return wrap;
}

// ===== SECTION: AFTERHOURS — Phase 7: Hot Singles =====
// The "Hot Singles in your area" section: a deterministic roster of FULL
// NPCs (world.hotSinglesRoster, pre-generated via createHotSingleNpc like
// the escorts — never vendor bots), profile pages, and a free "Say hi" flow
// that grants contact + a first IM. All site-side copy here is authored
// chrome (headline/bio/interests/distance/online), derived deterministically
// per npcId from the afterhours seed — never Math.random, so re-renders and
// reloads within a save stay identical. No payment anywhere: meeting them is
// free (that's the escorts' job).

// Roster read — PURE. Generation is not a render-time concern: creating six
// full NPCs mutates gameState.npcs, and this is called from the home banner,
// the browse grid and the profile view, i.e. from inside render passes. The
// ensure calls live on the three non-render paths instead (new-game write in
// STATE, the save-load path and the day rollover in UI, and AH_onSiteOpen
// below). An empty roster renders the section's empty state, which is the
// honest answer for the one tick before a backfill lands.
function AH_hotSinglesRoster(gs) {
  return gs?.world?.hotSinglesRoster || [];
}

const AH_HOT_SINGLE_HEADLINES = [
  'Looking for someone to actually talk to at 2am.',
  'Professional overthinker. Amateur flirt.',
  'I laugh at my own jokes. You have been warned.',
  'Will steal your hoodie and your heart, in that order.',
  'Into long walks to the fridge and longer conversations.',
  'Sarcasm is my love language.',
  'I cook. I clean. I make terrible decisions on weekends.',
  'Cat person, but I will make an exception for you.',
  'My vibe: chaotic good, zero chill.',
  'Just moved to the area. Know any good spots?',
];

const AH_HOT_SINGLE_BIOS = [
  'Day job by day, night owl by preference. I\'ve been told I\'m easy to talk to and hard to leave alone. Looking for someone who actually wants to hang out — not a pen pal, not a project.',
  'I spend my weekends trying new restaurants and my weeknights pretending I\'m going to bed early. I\'m forward, I\'m honest, and I know what I want. If that sounds like a lot, it is.',
  'The friends who know me best say I\'m trouble with a good heart. I take long walks, terrible selfies, and very serious opinions about music. Ask me anything — I usually answer.',
  'Gym in the morning, drinks in the evening, and absolutely no small talk. I\'d rather know your worst habit by the end of the first date than three years into the relationship.',
  'I\'m the one who always says yes. Karaoke, road trips, questionable decisions — in for a penny. Looking for somebody with the same energy and a strong tolerance for puns.',
  'Quietly intense, openly weird. I have a normal job and a not-so-normal collection of hobbies. The right person gets to see the whole list.',
];

const AH_HOT_SINGLE_INTERESTS = [
  'late-night diners', 'karaoke', 'thrift stores', 'true crime podcasts', 'baking at midnight',
  'hiking at sunrise', 'vintage vinyl', 'bad reality TV', 'cooking for two', 'bar trivia',
  'road trips with no plan', 'photography', 'the gym', 'cheap wine', 'board games',
  'live music', 'coffee snobbery', 'dancing badly on purpose',
];

// Deterministic per-npc site identity: headline, bio, distance ("in your
// area" flavour), online flag, and interest chips. Every call is a fresh
// seededRng on the same key, so renders can never drift it.
function AH_hotSingleProfile(gs, npcId) {
  const rng = seededRng(gs?.world?.computer?.apps?.browser?.afterHoursSeed || String(gs?.meta?.seed || 'afterhours'), `singles_${npcId}`);
  return {
    headline: AH_HOT_SINGLE_HEADLINES[Math.floor(rng() * AH_HOT_SINGLE_HEADLINES.length)],
    bio: AH_HOT_SINGLE_BIOS[Math.floor(rng() * AH_HOT_SINGLE_BIOS.length)],
    distanceMiles: (0.4 + rng() * 7.6).toFixed(1),
    online: rng() < 0.6,
    interests: pickUnique(rng, AH_HOT_SINGLE_INTERESTS, 4),
  };
}

// Deterministic "Say hi" opener — one line per npc, stable across re-renders.
function AH_hotSingleOpeningLine(gs, npcId) {
  const pool = AH_HOT_SINGLES_TUNING.openingLines || [];
  if (!pool.length) return 'Hey.';
  const rng = seededRng(gs?.world?.computer?.apps?.browser?.afterHoursSeed || String(gs?.meta?.seed || 'afterhours'), `sayhi_${npcId}`);
  return pool[Math.floor(rng() * pool.length)];
}

// The homepage banner — the section's front door (campy, seeded-free copy;
// the count is live from the roster).
function AH_renderHotSinglesBanner(gs) {
  const roster = AH_hotSinglesRoster(gs);
  const count = Math.max(roster.length, AH_HOT_SINGLES_TUNING.rosterSize);
  const banner = document.createElement('button');
  banner.className = 'ah-hotsingle-banner';
  banner.title = 'Hot Singles in your area';
  banner.addEventListener('click', () => { doAfterHoursHotSingles(); });
  const emoji = document.createElement('span');
  emoji.className = 'ah-hotsingle-banner-emoji';
  emoji.textContent = '🔥';
  const copy = document.createElement('span');
  copy.className = 'ah-hotsingle-banner-copy';
  copy.textContent = `${count} Hot Singles in YOUR area are online right now — no fee, no strings.`;
  const cta = document.createElement('span');
  cta.className = 'ah-hotsingle-banner-cta';
  cta.textContent = 'Browse Hot Singles →';
  banner.appendChild(emoji);
  banner.appendChild(copy);
  banner.appendChild(cta);
  return banner;
}

// The /hotsingles browse view: a section header + grid of single cards.
// Renders synchronously from the deterministic roster — no fetch, no
// skeleton, no payment anywhere.
function AH_renderHotSingles(body, gs, site) {
  const roster = AH_hotSinglesRoster(gs);
  const wrap = document.createElement('div');
  wrap.className = 'ah-home-section';
  const header = document.createElement('div');
  header.className = 'ah-row-header';
  const h = document.createElement('h4');
  h.textContent = 'Hot Singles in your area';
  header.appendChild(h);
  const size = document.createElement('span');
  size.className = 'dim tiny';
  size.textContent = `${roster.length} single${roster.length === 1 ? '' : 's'}`;
  header.appendChild(size);
  wrap.appendChild(header);
  const pitch = document.createElement('p');
  pitch.className = 'dim tiny ah-hotsingle-pitch';
  pitch.textContent = 'Real people. Free to say hi. What happens next is up to the two of you.';
  wrap.appendChild(pitch);
  body.appendChild(wrap);

  const grid = document.createElement('div');
  grid.className = 'ah-hotsingle-grid';
  if (!roster.length) {
    const empty = document.createElement('div');
    empty.className = 'ah-error';
    empty.textContent = 'No singles in your area right now. Try again later.';
    grid.appendChild(empty);
  }
  for (const entry of roster) {
    const npc = gs.npcs?.[entry.npcId];
    if (!npc) continue;
    grid.appendChild(AH_renderHotSingleCard(gs, entry, npc));
  }
  body.appendChild(grid);
}

function AH_renderHotSingleCard(gs, entry, npc) {
  const profile = AH_hotSingleProfile(gs, entry.npcId);
  const met = AH_hasMetSingle(gs, entry.npcId) || npc.contactKnown;
  const card = document.createElement('div');
  card.className = 'ah-hotsingle-card' + (met ? ' met' : '');
  card.addEventListener('click', () => { doAfterHoursHotSingle(entry.npcId); });

  const avatar = document.createElement('div');
  avatar.className = 'ah-hotsingle-avatar';
  avatar.textContent = (npc.bible?.name || '?').charAt(0).toUpperCase();
  card.appendChild(avatar);

  const info = document.createElement('div');
  info.className = 'ah-hotsingle-info';
  const nameRow = document.createElement('div');
  nameRow.className = 'ah-hotsingle-name-row';
  const name = document.createElement('span');
  name.className = 'ah-hotsingle-name';
  name.textContent = `${npc.bible?.name || 'Single'}, ${npc.bible?.age ?? ''}`;
  nameRow.appendChild(name);
  const online = document.createElement('span');
  online.className = 'ah-hotsingle-online' + (profile.online ? ' on' : '');
  online.textContent = profile.online ? 'online' : 'offline';
  nameRow.appendChild(online);
  info.appendChild(nameRow);
  const headline = document.createElement('div');
  headline.className = 'ah-hotsingle-headline';
  headline.textContent = profile.headline;
  info.appendChild(headline);
  const meta = document.createElement('div');
  meta.className = 'ah-hotsingle-meta dim tiny';
  meta.textContent = `${profile.distanceMiles} miles away · ${met ? 'You said hi ✓' : 'Say hi to meet them'}`;
  info.appendChild(meta);
  card.appendChild(info);
  return card;
}

// The /hot-single/<id> profile view: bigger card with bio, interests, and
// the Say hi action. All copy is seeded chrome (textContent-built nodes).
function AH_renderHotSingle(body, gs, site) {
  const browser = gs.world.computer.apps.browser;
  const npcId = browser.afterHoursView?.params?.npcId;
  const entry = AH_hotSinglesRoster(gs).find(e => e.npcId === npcId);
  const npc = npcId ? gs.npcs?.[npcId] : null;
  if (!entry || !npc) {
    const wrap = document.createElement('div');
    wrap.className = 'ah-404';
    const code = document.createElement('h3');
    code.textContent = '404 — Single not found';
    wrap.appendChild(code);
    const msg = document.createElement('p');
    msg.className = 'dim';
    msg.textContent = 'That profile doesn\'t exist. Maybe they deleted it.';
    wrap.appendChild(msg);
    const backBtn = document.createElement('button');
    backBtn.className = 'btn';
    backBtn.textContent = 'Back to Hot Singles';
    backBtn.addEventListener('click', () => { doAfterHoursHotSingles(); });
    wrap.appendChild(backBtn);
    body.appendChild(wrap);
    return;
  }

  const profile = AH_hotSingleProfile(gs, npcId);
  const met = AH_hasMetSingle(gs, npcId) || npc.contactKnown;

  const layout = document.createElement('div');
  layout.className = 'ah-hotsingle-profile';

  const avatar = document.createElement('div');
  avatar.className = 'ah-hotsingle-avatar big';
  avatar.textContent = (npc.bible?.name || '?').charAt(0).toUpperCase();
  layout.appendChild(avatar);

  const head = document.createElement('div');
  head.className = 'ah-hotsingle-profile-head';
  const name = document.createElement('h4');
  name.textContent = `${npc.bible?.name || 'Single'}, ${npc.bible?.age ?? ''}`;
  head.appendChild(name);
  const sub = document.createElement('div');
  sub.className = 'dim tiny';
  const online = document.createElement('span');
  online.className = 'ah-hotsingle-online' + (profile.online ? ' on' : '');
  online.textContent = profile.online ? 'Online now' : 'Offline';
  const sep = document.createTextNode(' · ');
  const dist = document.createTextNode(`${profile.distanceMiles} miles away · ${npc.bible?.gender || ''}`);
  sub.appendChild(online);
  sub.appendChild(sep);
  sub.appendChild(dist);
  head.appendChild(sub);
  layout.appendChild(head);

  const headline = document.createElement('p');
  headline.className = 'ah-hotsingle-profile-headline';
  headline.textContent = profile.headline;
  layout.appendChild(headline);

  const bio = document.createElement('p');
  bio.className = 'ah-hotsingle-profile-bio';
  bio.textContent = profile.bio;
  layout.appendChild(bio);

  const interests = document.createElement('div');
  interests.className = 'ah-keyword-chips';
  const ilabel = document.createElement('span');
  ilabel.className = 'dim tiny';
  ilabel.textContent = 'Interests:';
  interests.appendChild(ilabel);
  for (const it of profile.interests) {
    const chip = document.createElement('span');
    chip.className = 'ah-kw-chip';
    chip.textContent = it;
    interests.appendChild(chip);
  }
  layout.appendChild(interests);

  // Phase 8: "Invite Over" — the site's front door to real-world
  // relationships. Gated by the same facts doInviteOver enforces: moved-in
  // people can't be invited, you need to have said hi first, and a visit
  // already on the books (today or later) disables the button.
  const resident = npc.residency?.status === 'resident';
  const nowDay = gs.meta?.clock?.day ?? 1;
  // Matches what the handlers actually gate on — doInviteOver books TOMORROW
  // and refuses only if tomorrow is already taken. Disabling on any future
  // visit (`v.day >= nowDay`) meant a date in progress today locked you out
  // of booking the next one, which the handler would have allowed.
  const invited = !resident && (gs.world.visits || []).some(v =>
    v.npcId === npcId && visitDay(v) === nowDay + 1 && v.status !== 'done' && v.status !== 'deferred');

  const actions = document.createElement('div');
  actions.className = 'ah-watch-actions';
  const hiBtn = document.createElement('button');
  hiBtn.className = 'btn' + (met ? ' btn-secondary' : ' ah-hotsingle-sayhi');
  hiBtn.textContent = met ? 'You said hi ✓ — check your phone' : 'Say hi';
  hiBtn.title = met ? 'They already texted you.' : 'Send them a hello — free.';
  hiBtn.addEventListener('click', () => { doAfterHoursSayHi(npcId); });
  actions.appendChild(hiBtn);
  const invBtn = document.createElement('button');
  invBtn.className = resident ? 'btn btn-secondary' : 'btn ah-hotsingle-invite';
  if (resident) {
    invBtn.textContent = 'Lives with you';
    invBtn.disabled = true;
    invBtn.title = 'They already moved in.';
  } else if (!met) {
    invBtn.textContent = 'Say hi first';
    invBtn.disabled = true;
    invBtn.title = 'Send a free hello before inviting anyone over.';
  } else if (invited) {
    invBtn.textContent = 'Invited — coming by';
    invBtn.disabled = true;
    invBtn.title = 'A visit is already on the books.';
  } else {
    invBtn.textContent = 'Invite Over';
    invBtn.title = 'Ask them to come by tomorrow — free, no strings.';
    invBtn.addEventListener('click', () => { doAfterHoursInviteOver(npcId); });
  }
  actions.appendChild(invBtn);
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary tiny';
  backBtn.textContent = '← Back to Hot Singles';
  backBtn.addEventListener('click', () => { doAfterHoursHotSingles(); });
  actions.appendChild(backBtn);
  layout.appendChild(actions);

  body.appendChild(layout);
}

// Did the player say hi to this single? Reads the durable metNpcIds list.
function AH_hasMetSingle(gs, npcId) {
  const ah = gs?.world?.afterHours;
  return Array.isArray(ah?.metNpcIds) && ah.metNpcIds.includes(npcId);
}

// category / search render the one blended grid — home is its own view
// (AH_renderHome).
function AH_renderBrowse(body, gs, site) {
  const browser = gs.world.computer.apps.browser;
  const raw = browser.afterHoursClips;
  const grid = document.createElement('div');
  grid.className = 'ah-content-grid';

  if (browser.afterHoursClipsLoading && (!raw || raw.length === 0)) {
    AH_renderSkeletonGrid(grid);
  } else if (!Array.isArray(raw)) {
    // First paint before the fetch hook (AH.onSiteOpen) has run — same
    // skeleton, not a flash of the empty state.
    AH_renderSkeletonGrid(grid);
  } else if (raw.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ah-error';
    empty.textContent = browser.afterHoursClipsError || 'No clips loaded. Click Refresh.';
    grid.appendChild(empty);
  } else {
    // The search view's sort/source filters are a DISPLAY layer over the
    // cached blended page — the underlying grid is untouched.
    const clips = browser.afterHoursView?.view === 'search' ? AH_displayClips(browser, raw) : raw;
    if (clips.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ah-error';
      empty.textContent = 'No results match your filters.';
      grid.appendChild(empty);
    } else {
      for (const clip of clips) {
        grid.appendChild(AH_renderClipCard(clip));
      }
    }
  }
  body.appendChild(grid);
}

function AH_renderSkeletonGrid(grid) {
  for (let i = 0; i < 12; i++) grid.appendChild(AH_renderSkeletonCard());
}

function AH_renderClipCard(clip) {
  const card = document.createElement('div');
  card.className = 'ah-card';
  card.setAttribute('data-action', 'browser.ah-watch');
  card.setAttribute('data-row-id', clip.id);

  const thumb = document.createElement('div');
  thumb.className = 'ah-thumb';
  if (clip.thumb) {
    // Built as nodes, not an innerHTML template — every field here is
    // verbatim third-party API output (Design invariant 2).
    const img = document.createElement('img');
    img.src = clip.thumb;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.style.display = 'none';
      thumb.textContent = 'Click to play';
    });
    thumb.appendChild(img);
    const badge = document.createElement('span');
    badge.className = 'ah-source-badge' + (clip.sources && clip.sources.length > 1 ? ' multi' : '');
    badge.textContent = clip.sources && clip.sources.length > 1
      ? `${clip.sources.length} sources`
      : (AH_SOURCES[clip.sources?.[0]]?.badge || '');
    thumb.appendChild(badge);
    const dur = document.createElement('span');
    dur.className = 'ah-duration';
    dur.textContent = clip.duration || '';
    thumb.appendChild(dur);
    const views = document.createElement('span');
    views.className = 'ah-views';
    views.textContent = formatViews(clip.views);
    thumb.appendChild(views);
  } else {
    thumb.textContent = 'Click to play';
  }
  card.appendChild(thumb);

  const title = document.createElement('div');
  title.className = 'ah-card-title';
  title.textContent = clip.title;
  card.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'ah-card-meta';
  meta.textContent = clip.rating ? `★ ${clip.rating}%` : '';
  card.appendChild(meta);

  return card;
}

// The routed player page (/watch/<id>) — the relocated watch panel built
// out into a real page (Phase 3): full meta row, Like/Share actions, the
// Up Next rail, the "More Like This" + "Because you watched" blended rows,
// and the deterministic seeded comments section. The sacred
// masturbate/cum/stop session controls stay in the actions row below the
// embed, untouched from Phase 2.
function AH_renderPlayer(body, gs, site) {
  const browser = gs.world.computer.apps.browser;
  // The clip may come from the browse grid, a session snapshot (Continue
  // Watching), or a home row cache entry.
  const clip = AH_findClip(browser, browser.afterHoursWatching);

  if (!clip) {
    const panel = document.createElement('div');
    panel.className = 'ah-watch-panel';
    const msg = document.createElement('p');
    msg.className = 'ah-error';
    msg.textContent = 'This video is no longer available.';
    panel.appendChild(msg);
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary tiny';
    backBtn.textContent = '← Back to results';
    backBtn.addEventListener('click', () => { doAfterHoursClose(); });
    panel.appendChild(backBtn);
    body.appendChild(panel);
    return;
  }

  const cacheEntry = AH_relatedCache[clip.id];
  const rows = cacheEntry?.status === 'done' ? (cacheEntry.rows || null) : null;

  const layout = document.createElement('div');
  layout.className = 'ah-player-layout';
  layout.id = 'ah-watch-panel';

  const main = document.createElement('div');
  main.className = 'ah-player-main';

  const heading = document.createElement('h4');
  heading.textContent = clip.title;
  main.appendChild(heading);
  main.appendChild(AH_renderPlayerMeta(gs, clip));

  const host = (clip.sources || []).includes(browser.afterHoursHost) ? browser.afterHoursHost : (clip.sources || [])[0];
  main.appendChild(AH_renderEmbed(clip, host));
  if (clip.sources && clip.sources.length > 1) main.appendChild(AH_renderHostSwitch(clip, host));
  main.appendChild(AH_renderPlayerActions(gs, clip));
  // Phase 5: a banner ad under the player controls, and a skyscraper in
  // the rail column — both rotate on the lifecycle timer.
  main.appendChild(AH_renderAdSlot('banner', gs));
  main.appendChild(AH_renderComments(gs, clip));

  layout.appendChild(main);
  const rail = AH_renderUpNext(gs, clip, rows);
  rail.prepend(AH_renderAdSlot('skyscraper', gs));
  layout.appendChild(rail);
  body.appendChild(layout);

  body.appendChild(AH_renderRelatedSection(gs, clip, 'More Like This', rows?.moreLikeThis, cacheEntry));
  body.appendChild(AH_renderRelatedSection(gs, clip, 'Because you watched', rows?.becauseYouWatched, cacheEntry));
}

function AH_renderEmbed(clip, host) {
  const embedCtn = document.createElement('div');
  embedCtn.className = 'ah-embed-ctn';
  const activeEmbedUrl = clip.embedUrls?.[host];
  const activeWatchUrl = clip.watchUrls?.[host];
  if (activeEmbedUrl) {
    // Built as a node so the API-derived URL lands in a property rather
    // than being interpolated into an attribute. Both hosts' iframes are
    // built by this SAME block, so both always carry the identical
    // sandbox + referrerpolicy (Design invariant 1).
    const frame = document.createElement('iframe');
    frame.src = activeEmbedUrl;
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    embedCtn.appendChild(frame);
    frame.addEventListener('error', () => {
      embedCtn.innerHTML = '';
      showEmbedFallback(embedCtn, activeWatchUrl);
    });
    const fallbackBar = document.createElement('div');
    fallbackBar.className = 'ah-embed-fallback-bar';
    const troubleBtn = document.createElement('button');
    troubleBtn.className = 'btn btn-secondary tiny';
    troubleBtn.textContent = 'Video not loading? Watch on site →';
    troubleBtn.title = 'Open in new tab';
    troubleBtn.addEventListener('click', () => {
      if (activeWatchUrl) window.open(activeWatchUrl, '_blank', 'noopener,noreferrer');
    });
    fallbackBar.appendChild(troubleBtn);
    embedCtn.appendChild(fallbackBar);
  } else {
    const err = document.createElement('p');
    err.className = 'ah-error';
    err.textContent = 'Embed unavailable.';
    embedCtn.appendChild(err);
    if (activeWatchUrl) {
      const link = document.createElement('button');
      link.className = 'btn btn-secondary tiny';
      link.textContent = 'Watch on site →';
      link.addEventListener('click', () => window.open(activeWatchUrl, '_blank', 'noopener,noreferrer'));
      embedCtn.appendChild(link);
    }
  }
  return embedCtn;
}

function AH_renderHostSwitch(clip, host) {
  const hostRow = document.createElement('div');
  hostRow.className = 'ah-host-switch';
  const hostLabel = document.createElement('span');
  hostLabel.className = 'dim tiny';
  hostLabel.textContent = 'Source:';
  hostRow.appendChild(hostLabel);
  for (const source of clip.sources) {
    const chip = document.createElement('button');
    chip.className = 'ah-host-chip' + (source === host ? ' active' : '');
    chip.setAttribute('data-action', 'browser.ah-host');
    chip.setAttribute('data-source', source);
    chip.textContent = AH_SOURCES[source]?.badge || source.toUpperCase();
    hostRow.appendChild(chip);
  }
  return hostRow;
}

// Meta line + keyword chips. All values are API-derived, so every one goes
// in via textContent (Design invariant 2); the chips double as search
// entry points.
function AH_renderPlayerMeta(gs, clip) {
  const meta = document.createElement('div');
  meta.className = 'ah-watch-meta';
  const parts = [];
  if (clip.views) parts.push(formatViews(clip.views));
  if (clip.duration) parts.push(clip.duration);
  if (clip.rating) parts.push(`★ ${clip.rating}%`);
  if (clip.addedDaysAgo != null) {
    parts.push(clip.addedDaysAgo === 0 ? 'Today' : `${clip.addedDaysAgo} day${clip.addedDaysAgo === 1 ? '' : 's'} ago`);
  }
  const cat = AH_siteCategoryLabel(gs, clip.category);
  if (cat) parts.push(cat);
  const line = document.createElement('span');
  line.textContent = parts.join(' · ');
  meta.appendChild(line);
  if (clip.keywords?.length) {
    const chips = document.createElement('div');
    chips.className = 'ah-keyword-chips';
    for (const kw of clip.keywords.slice(0, 6)) {
      const chip = document.createElement('button');
      chip.className = 'ah-kw-chip';
      chip.textContent = kw;
      chip.title = 'Search for this';
      chip.addEventListener('click', () => { doAfterHoursSearch(kw); });
      chips.appendChild(chip);
    }
    meta.appendChild(chips);
  }
  return meta;
}

function AH_siteCategoryLabel(gs, catId) {
  return SITE_DEFS['afterhours']?.adultContent?.categories.find(c => c.id === catId)?.label || null;
}

// Action row: Like (heart) + Share, then the Close player / session
// controls exactly as Phase 2 shipped them.
function AH_renderPlayerActions(gs, clip) {
  const browser = gs.world.computer.apps.browser;
  const actions = document.createElement('div');
  actions.className = 'ah-watch-actions';

  const liked = AH_isLiked(gs, clip.id);
  const likeBtn = document.createElement('button');
  likeBtn.className = 'btn btn-secondary tiny ah-like-btn' + (liked ? ' liked' : '');
  likeBtn.textContent = liked ? '♥ Liked' : '♡ Like';
  likeBtn.title = liked ? 'Remove from Liked' : 'Add to Liked';
  likeBtn.addEventListener('click', () => AH_toggleLike(clip.id));
  actions.appendChild(likeBtn);

  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn btn-secondary tiny';
  shareBtn.textContent = 'Share ↗';
  shareBtn.title = 'Copy share link';
  shareBtn.addEventListener('click', () => AH_shareClip(clip));
  actions.appendChild(shareBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-secondary tiny';
  closeBtn.setAttribute('data-action', 'browser.ah-close');
  closeBtn.textContent = 'Close player';
  actions.appendChild(closeBtn);

  // Session-active is DERIVED: the record exists but the device must still
  // be in use (a pocketed/locked/dead phone or a powered-off computer reads
  // as inactive here too).
  if (isAfterHoursSessionActive(gs)) {
    const sessionMinutes = browser.afterHoursSession?.startedTick != null
      ? Math.max(0, Math.round(clockToAbsolute(gs.meta.clock) - browser.afterHoursSession.startedTick))
      : 0;
    const status = document.createElement('span');
    status.className = 'ah-session-status dim tiny';
    status.textContent = `Session: ${sessionMinutes} min`;
    actions.appendChild(status);

    // Warmup is derived from state (a wall-clock deadline stored when the
    // session started), not from a timer scheduled inside the render pass.
    const warmedUp = Date.now() >= (browser.afterHoursWarmupUntilMs || 0);
    const cumBtn = document.createElement('button');
    cumBtn.className = 'btn ah-cum-btn' + (warmedUp ? ' ready' : '');
    cumBtn.setAttribute('data-action', 'browser.ah-cum');
    cumBtn.textContent = 'Cum';
    cumBtn.disabled = !warmedUp;
    cumBtn.id = 'ah-cum-btn';
    actions.appendChild(cumBtn);

    const stopBtn = document.createElement('button');
    stopBtn.className = 'btn btn-secondary tiny';
    stopBtn.setAttribute('data-action', 'browser.ah-stop');
    stopBtn.textContent = 'Stop';
    actions.appendChild(stopBtn);
  } else {
    const masturbateBtn = document.createElement('button');
    masturbateBtn.className = 'btn ah-masturbate-btn';
    masturbateBtn.setAttribute('data-action', 'browser.ah-masturbate');
    masturbateBtn.textContent = 'Masturbate';
    actions.appendChild(masturbateBtn);
  }
  return actions;
}

// --- Up Next rail (right column) ---
// The "queue": clips following the current one in the live browse grid
// (wrapping), skipping anything already shown in a related row, topped up
// from the related rows themselves when the grid runs short. Pure function
// of state — deterministic and render-safe.
function AH_upNextQueue(browser, clip, rows) {
  const grid = browser.afterHoursClips || [];
  const gridIdx = grid.findIndex(c => c.id === clip.id);
  const used = new Set([clip.id]);
  const out = [];
  if (gridIdx >= 0) {
    const rowIds = new Set([...(rows?.moreLikeThis || []), ...(rows?.becauseYouWatched || [])].map(c => c.id));
    for (let i = 1; i <= grid.length && out.length < AH_TUNING.upNextCount; i++) {
      const c = grid[(gridIdx + i) % grid.length];
      if (used.has(c.id) || rowIds.has(c.id)) continue;
      used.add(c.id);
      out.push(c);
    }
  }
  if (out.length < AH_TUNING.upNextCount) {
    for (const c of [...(rows?.moreLikeThis || []), ...(rows?.becauseYouWatched || [])]) {
      if (used.has(c.id)) continue;
      used.add(c.id);
      out.push(c);
      if (out.length >= AH_TUNING.upNextCount) break;
    }
  }
  return out;
}

function AH_renderUpNext(gs, clip, rows) {
  const browser = gs.world.computer.apps.browser;
  const rail = document.createElement('div');
  rail.className = 'ah-rail';
  const header = document.createElement('div');
  header.className = 'ah-rail-header';
  const h = document.createElement('h4');
  h.textContent = 'Up Next';
  header.appendChild(h);
  rail.appendChild(header);

  const queue = AH_upNextQueue(browser, clip, rows);
  if (!queue.length) {
    const dim = document.createElement('p');
    dim.className = 'dim tiny ah-rail-empty';
    dim.textContent = 'No more videos in this feed.';
    rail.appendChild(dim);
    return rail;
  }
  for (const next of queue) rail.appendChild(AH_renderUpNextRow(next));
  return rail;
}

function AH_renderUpNextRow(clip) {
  const row = document.createElement('button');
  row.className = 'ah-upnext-row';
  row.setAttribute('data-action', 'browser.ah-watch');
  row.setAttribute('data-row-id', clip.id);
  const thumb = document.createElement('span');
  thumb.className = 'ah-upnext-thumb';
  if (clip.thumb) {
    const img = document.createElement('img');
    img.src = clip.thumb;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { thumb.textContent = '▶'; });
    thumb.appendChild(img);
  } else {
    thumb.textContent = '▶';
  }
  const dur = document.createElement('span');
  dur.className = 'ah-duration';
  dur.textContent = clip.duration || '';
  thumb.appendChild(dur);
  row.appendChild(thumb);
  const info = document.createElement('span');
  info.className = 'ah-upnext-info';
  const t = document.createElement('span');
  t.className = 'ah-upnext-title';
  t.textContent = clip.title;
  const m = document.createElement('span');
  m.className = 'ah-upnext-meta dim tiny';
  m.textContent = [clip.duration, clip.views ? formatViews(clip.views) : ''].filter(Boolean).join(' · ');
  info.appendChild(t);
  info.appendChild(m);
  row.appendChild(info);
  return row;
}

// --- Related rows: "More Like This" / "Because you watched" ---
function AH_renderRelatedSection(gs, clip, title, clips, cacheEntry) {
  const section = document.createElement('div');
  section.className = 'ah-related-section';
  const header = document.createElement('div');
  header.className = 'ah-related-header';
  const h = document.createElement('h4');
  h.textContent = title;
  header.appendChild(h);
  if (clips?.length && !cacheEntry?.error) {
    const size = document.createElement('span');
    size.className = 'dim tiny';
    size.textContent = `${clips.length} videos`;
    header.appendChild(size);
  }
  section.appendChild(header);
  const row = document.createElement('div');
  row.className = 'ah-related-row';
  if (!clips) {
    if (cacheEntry?.status === 'fetching') {
      for (let i = 0; i < 6; i++) row.appendChild(AH_renderSkeletonCard());
    } else {
      const dim = document.createElement('p');
      dim.className = 'dim tiny ah-related-empty';
      dim.textContent = cacheEntry?.error || 'Nothing here yet.';
      row.appendChild(dim);
    }
  } else if (!clips.length) {
    const dim = document.createElement('p');
    dim.className = 'dim tiny ah-related-empty';
    dim.textContent = 'Nothing here yet.';
    row.appendChild(dim);
  } else {
    for (const c of clips.slice(0, AH_TUNING.relatedRowSize)) row.appendChild(AH_renderClipCard(c));
  }
  section.appendChild(row);
  return section;
}

function AH_renderSkeletonCard() {
  const card = document.createElement('div');
  card.className = 'ah-card ah-skeleton-card';
  const thumb = document.createElement('div');
  thumb.className = 'ah-thumb ah-skeleton';
  card.appendChild(thumb);
  const title = document.createElement('div');
  title.className = 'ah-card-title ah-skeleton ah-skeleton-title';
  card.appendChild(title);
  return card;
}

// --- Seeded comments (Phase 3) ---
// Deterministic per save per clip: seededRng(afterHoursSeed, 'afterhours|
// comments:<clipId>'), so a re-render or reload of the same save shows the
// exact same comments, while a different save gets its own. Comment copy is
// authored chrome (Locked decision 11); the only API-derived strings are
// the optional clip-title lines, built via textContent (invariant 2).
const AH_COMMENT_USERS = [
  'BigDickRick2004', 'Lonely_Mike', 'BustyBetty88', 'xX_CumSlayer_Xx', 'DesperateDave',
  'MilfHunter_Sam', 'SweetNurseKim', 'WhiskeyBarrel', 'StepBroNoPls', 'NaughtyNancy',
  'DaddyDom22', 'GamerGurl69', 'NeighborhoodGuy', 'TylerTheCreatorFan', 'JennyFromTheBlock',
  'HandsyHank', 'SirPoundsalot', 'CouchPotatoCouple', 'RetiredRocker', 'VickysVault',
  'TopRopeTom', 'LaundryRoomLarry', 'BaristaBarb', 'NightShiftNina', 'OneEyeJack',
  'MoistRita', 'BasementBob', 'GymRatGreg',
];

const AH_AVATAR_COLORS = ['#e05d5d', '#5d8ce0', '#5dcd6e', '#d9a83f', '#9a5de0', '#e05da8', '#3fb9c9', '#e0783f'];

const AH_COMMENT_TIMES = [
  'just now', '2 minutes ago', '11 minutes ago', '32 minutes ago', '1 hour ago',
  '3 hours ago', '5 hours ago', 'Yesterday', '2 days ago', '4 days ago', '1 week ago',
  '2 weeks ago', '1 month ago', '3 months ago', '8 months ago', '1 year ago', '2 years ago',
];

const AH_COMMENT_TEXTS = [
  "Why is this not in 4k yet?",
  "Studio quality upload. Respect.",
  "Been looking for this for YEARS. Legendary uploader.",
  "The last part had me like 😳",
  "Reminds me of my college roommate. Long story.",
  "My boss walked in while I was watching this. I said it was a cooking tutorial. He didn't believe me.",
  "Who else is here instead of sleeping?",
  "Watched this at 2AM. No regrets.",
  "Quality content, finally.",
  "How does this only have this many views? Criminal.",
  "Can we talk about the camerawork though?",
  "Uploader is doing God's work out here.",
  "This got recommended to me and honestly? Not mad about it.",
  "If my girlfriend sees my history she's going to have questions.",
  "Petition to make this a full series. Sign me up.",
  "First. As always. What are you gonna do about it.",
  "The comments section is more entertaining than my actual life.",
  "Found this through a very specific search and it did not disappoint.",
  "That ending. That ENDING.",
  "I'm taking notes for later.",
  "Just here for the memes. And the rest.",
  "Timestamp 12:34 hits different.",
  "The plot at 6:40 is CINEMA.",
  "My neighbor heard the audio and asked for the link. Sent it. No ragrets.",
  "Been a subscriber since 2007. This site never misses.",
  "Mute your speakers before the last two minutes. Trust me.",
  "The way they said \"trust me process\" made me spit out my coffee.",
  "10/10 would watch again. Immediately.",
];

const AH_COMMENT_TITLE_TPL = [
  t => `Came here for "${t}" and stayed for the plot.`,
  t => `My search history is 40% "${t}". No shame.`,
  t => `Finally, a clean upload of "${t}". Respect.`,
  t => `Bookmarked "${t}" for later. You're welcome, future me.`,
];

function AH_commentRng(gs, clipId) {
  const seed = gs?.world?.computer?.apps?.browser?.afterHoursSeed || String(gs?.meta?.seed || 'afterhours');
  // Sub-keyed off the site's seed stream (the Phase 2 AH_SEED), so the
  // same clip shows the same comments across re-renders within a save.
  return seededRng(seed, 'afterhours|comments:' + clipId);
}

function AH_renderComments(gs, clip) {
  const rng = AH_commentRng(gs, clip.id);
  const section = document.createElement('div');
  section.className = 'ah-comments';
  const header = document.createElement('div');
  header.className = 'ah-comments-header';
  const h = document.createElement('h4');
  h.textContent = 'Comments';
  const count = document.createElement('span');
  count.className = 'ah-comments-count dim tiny';
  count.textContent = AH_formatCount(Math.floor(rng() * 900) + 150);
  header.appendChild(h);
  header.appendChild(count);
  section.appendChild(header);

  const n = 4 + Math.floor(rng() * 5); // 4–8 comments per clip
  const usedNames = new Set();
  for (let i = 0; i < n; i++) {
    section.appendChild(AH_renderComment(rng, clip, usedNames));
  }
  return section;
}

function AH_renderComment(rng, clip, usedNames) {
  let name = AH_COMMENT_USERS[Math.floor(rng() * AH_COMMENT_USERS.length)];
  for (let guard = 0; guard < AH_COMMENT_USERS.length && usedNames.has(name); guard++) {
    name = AH_COMMENT_USERS[Math.floor(rng() * AH_COMMENT_USERS.length)];
  }
  usedNames.add(name);
  const color = AH_AVATAR_COLORS[Math.floor(rng() * AH_AVATAR_COLORS.length)];
  const when = AH_COMMENT_TIMES[Math.floor(rng() * AH_COMMENT_TIMES.length)];
  let text = AH_COMMENT_TEXTS[Math.floor(rng() * AH_COMMENT_TEXTS.length)];
  if (rng() < 0.22) {
    const tpl = AH_COMMENT_TITLE_TPL[Math.floor(rng() * AH_COMMENT_TITLE_TPL.length)];
    text = tpl(clip.title);
  }
  const likes = Math.floor(rng() * 1200);
  const replies = rng() < 0.4 ? 1 + Math.floor(rng() * 12) : 0;

  const row = document.createElement('div');
  row.className = 'ah-comment';
  const avatar = document.createElement('span');
  avatar.className = 'ah-comment-avatar';
  avatar.style.background = color;
  avatar.textContent = (name[0] || '?').toUpperCase();
  row.appendChild(avatar);
  const bodyEl = document.createElement('div');
  bodyEl.className = 'ah-comment-body';
  const byline = document.createElement('div');
  byline.className = 'ah-comment-byline';
  const uname = document.createElement('span');
  uname.className = 'ah-comment-name';
  uname.textContent = name;
  const whenEl = document.createElement('span');
  whenEl.className = 'ah-comment-time dim tiny';
  whenEl.textContent = when;
  byline.appendChild(uname);
  byline.appendChild(whenEl);
  bodyEl.appendChild(byline);
  const textEl = document.createElement('div');
  textEl.className = 'ah-comment-text';
  textEl.textContent = text;
  bodyEl.appendChild(textEl);
  const metaEl = document.createElement('div');
  metaEl.className = 'ah-comment-meta dim tiny';
  metaEl.textContent = `👍 ${likes}${replies ? ` · 💬 ${replies} replies` : ''}`;
  bodyEl.appendChild(metaEl);
  row.appendChild(bodyEl);
  return row;
}

function AH_formatCount(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// --- Related-rows pipeline (Phase 3) ---
// Two blended rows per clip: "More Like This" (top keywords of the clip)
// and "Because you watched" (keywords of the OTHER clips watched this
// session — a genuine personalisation signal; falls back to the clip's
// next keywords on a first watch). Each row is one blended search per top
// keyword, merged + deduped against the current clip and across rows.
// Kicked from ahNav on any player navigation; a per-clip cache status
// guards against re-nav refetches. Lives in the async fetch path (a
// handler, never a render pass — Locked decision 14).
function AH_kickRelatedFetch(gs, clipId) {
  const browser = gs?.world?.computer?.apps?.browser;
  if (!browser || !clipId) return;
  const clip = AH_findClip(browser, clipId);
  if (!clip) return;
  const entry = AH_relatedCache[clipId];
  if (entry?.status === 'done') return;
  // A live 'fetching' entry is this session's in-flight fetch — the guard that
  // stops the resume kick and the open hook from racing each other onto the
  // same clip. One older than the staleness window is a fetch that crashed
  // without settling; drop it and refetch rather than deadlock the rail.
  if (entry?.status === 'fetching') {
    if (typeof entry.startedAt === 'number' && Date.now() - entry.startedAt <= AH_TUNING.relatedStaleMs) return;
    delete AH_relatedCache[clipId];
  }
  AH_relatedCache[clipId] = { status: 'fetching', rows: null, startedAt: Date.now() };
  fetchRelatedForClip(clip);
}

async function fetchRelatedForClip(clip) {
  try {
    const more = await AH_relatedFromKeywords(clip, AH_relatedKeywords(clip, 'moreLikeThis'), new Set([clip.id]));
    const because = await AH_relatedFromKeywords(clip, AH_relatedKeywords(clip, 'becauseYouWatched'), new Set([clip.id, ...more.map(c => c.id)]));
    const browser = currentGameState?.world?.computer?.apps?.browser;
    if (!browser) return;
    // Player moved on since this fetch started — drop the entry so a later
    // return to this clip re-fetches fresh. This is a WATCHING check rather
    // than a cache-status check so the result still lands when the player is
    // still on the clip, whatever else happened to the cache meanwhile.
    if (browser.afterHoursWatching !== clip.id) { delete AH_relatedCache[clip.id]; return; }
    AH_relatedCache[clip.id] = { status: 'done', rows: { moreLikeThis: more, becauseYouWatched: because } };
  } catch (e) {
    const browser = currentGameState?.world?.computer?.apps?.browser;
    if (browser?.afterHoursWatching !== clip.id) delete AH_relatedCache[clip.id];
    else AH_relatedCache[clip.id] = { status: 'done', rows: null, error: 'Related videos failed to load.' };
  } finally {
    AH_refresh();
  }
}

function AH_relatedKeywords(clip, which) {
  const keywords = (clip.keywords || []).length ? clip.keywords : titleKeywords(clip.title);
  if (which === 'moreLikeThis') return keywords.slice(0, AH_TUNING.relatedKeywordsPerRow);
  // "Because you watched" reads the PERSISTED watch history (Phase 6) so
  // it's a different signal than the clip's own keywords and survives
  // reloads — history records carry their own keywords (or re-derive them
  // from the title).
  const ah = currentGameState?.world?.afterHours;
  const kwSet = new Set();
  for (const rec of (ah?.history || [])) {
    if (rec.clipId === clip.id) continue;
    const kws = (Array.isArray(rec.keywords) && rec.keywords.length) ? rec.keywords : titleKeywords(rec.title);
    for (const kw of kws) kwSet.add(kw);
  }
  const mix = [...kwSet];
  if (mix.length) return mix.slice(0, AH_TUNING.relatedKeywordsPerRow);
  return keywords.slice(AH_TUNING.relatedKeywordsPerRow, AH_TUNING.relatedKeywordsPerRow * 2);
}

// One blended search per keyword (each fanned out to both sources and
// blended), merged + deduped against `exclude` (the current clip and, for
// the second row, the first row's picks).
async function AH_relatedFromKeywords(clip, keywords, exclude) {
  if (!keywords?.length) return [];
  const results = await Promise.all(keywords.map(kw =>
    (async () => {
      const [phResult, epResult] = await Promise.allSettled([
        AH_SOURCES.ph.search(kw, 1),
        AH_SOURCES.ep.search(kw, 1),
      ]);
      const ph = phResult.status === 'fulfilled' ? phResult.value.videos : [];
      const ep = epResult.status === 'fulfilled' ? epResult.value.videos : [];
      return blendResults({ ph, ep });
    })()
  ));
  const seen = new Set(exclude || []);
  const merged = [];
  for (const list of results) {
    for (const c of list) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
  }
  return merged.slice(0, AH_TUNING.relatedRowSize);
}

// --- Player page actions: Like, Share, toasts (Phase 3) ---

// Snapshot of a normalized clip that stays usable offline of the browse
// grid — /liked (Phase 3), Continue Watching and Recommended for You
// (Phase 4) all reopen players from snapshots alone.
function AH_clipSnapshot(clip) {
  return {
    clipId: clip.id, title: clip.title, thumb: clip.thumb,
    embedUrls: clip.embedUrls, watchUrls: clip.watchUrls,
    duration: clip.duration, durationSec: clip.durationSec,
    views: clip.views, rating: clip.rating,
    sources: clip.sources, category: clip.category,
    keywords: clip.keywords, addedDaysAgo: clip.addedDaysAgo,
  };
}

// --- Durable watch data (Phase 6) ---
// world.afterHours (a world sub-key persisted by state.js) is the single
// source of truth for history/liked/searchHistory/continueWatching. The
// browser object still carries the SESSION signals (the watched stack for
// this page load), but every durable signal reads from the world store so
// it survives reloads. Records are full clip snapshots plus the plan's
// day/tick fields — they must render cards and reopen the player from their
// stored embeds alone, offline of any fresh search.

function AH_worldAh(gs) {
  if (!gs?.world) return null;
  if (!gs.world.afterHours) gs.world.afterHours = defaultAfterHoursState();
  return gs.world.afterHours;
}

// A persisted record (history/liked/continueWatching) → canonical clip shape
// (with `id`), so cards render and the player reopens from stored embeds
// without a fresh search. Missing API display fields degrade to undefined
// (cards just omit those chips); keywords re-derive from the title so the
// personalisation signals still work offline.
function AH_recordToClip(rec) {
  const title = rec?.title || '';
  return Object.assign({}, rec, {
    id: rec.clipId,
    keywords: (Array.isArray(rec.keywords) && rec.keywords.length) ? rec.keywords : titleKeywords(title),
  });
}

// Record a watch: history (capped, newest-first, deduped by clip) plus the
// continueWatching resume record. Called from the watch handler (never a
// render pass); the surrounding doAfterHoursWatch then hits saveAtBoundary,
// so the record persists immediately.
function AH_recordWatch(gs, clip) {
  const ah = AH_worldAh(gs);
  if (!ah || !clip?.id) return;
  const day = gs.meta?.clock?.day ?? 1;
  const tick = clockToAbsolute(gs.meta.clock);
  const rec = Object.assign(AH_clipSnapshot(clip), {
    day, tick, watchMinutes: 0,
    source: (clip.sources || [])[0] || null,
  });
  ah.history = [rec, ...ah.history.filter(h => h.clipId !== clip.id)]
    .slice(0, AH_TUNING.historyCap);
  ah.continueWatching = rec;
}

// Record a search (capped, newest-first, deduped by exact query).
function AH_recordSearch(gs, query) {
  const ah = AH_worldAh(gs);
  const q = (query || '').trim();
  if (!ah || !q) return;
  const day = gs.meta?.clock?.day ?? 1;
  ah.searchHistory = [{ query: q, day }, ...ah.searchHistory.filter(s => s.query !== q)]
    .slice(0, AH_TUNING.searchHistoryCap);
}

// Find a clip wherever it lives: the browse grid, the session snapshots,
// the home row cache (Phase 4 cards are fetched by the row pipeline, not
// the grid, so they must be reachable here to open the player), or the
// durable world.afterHours store (Phase 6 — history/liked/continueWatching
// carry their own embeds, so /history-style re-watches reopen offline of a
// fresh search).
function AH_findClip(browser, clipId) {
  if (!browser || !clipId) return null;
  const inGrid = (browser.afterHoursClips || []).find(c => c.id === clipId);
  if (inGrid) return inGrid;
  const inSnap = AH_watchedSnapshots[clipId];
  // Snapshots store the id as `clipId` (AH_clipSnapshot), but every caller
  // of AH_findClip expects the canonical clip shape with `id` — the related
  // rows write-back keyed on clip.id silently no-oped against a snapshot
  // and left the cache entry 'fetching' forever. Normalize here so the
  // lookup is shape-stable regardless of which cache the clip came from.
  // (Session-scoped: after a reload the world.afterHours fallback below is
  // what resolves a previously-watched clip.)
  if (inSnap) return Object.assign({}, inSnap, { id: inSnap.clipId || clipId });
  const cache = AH_rowCache;
  for (const key of Object.keys(cache)) {
    const entry = cache[key];
    if (entry?.status !== 'done' || !Array.isArray(entry.clips)) continue;
    const c = entry.clips.find(x => x.id === clipId);
    if (c) return c;
  }
  const ah = currentGameState?.world?.afterHours;
  if (ah) {
    const allRecs = [...(ah.history || []), ...(ah.liked || [])];
    const rec = allRecs.find(r => r.clipId === clipId) ||
      (ah.continueWatching?.clipId === clipId ? ah.continueWatching : null);
    if (rec) return AH_recordToClip(rec);
  }
  return null;
}

function AH_isLiked(gs, clipId) {
  return !!(gs?.world?.afterHours?.liked || []).some(r => r.clipId === clipId);
}

function AH_toggleLike(clipId) {
  const browser = currentGameState?.world?.computer?.apps?.browser;
  if (!browser) return;
  const clip = AH_findClip(browser, clipId);
  if (!clip) return;
  const ah = AH_worldAh(currentGameState);
  if (!ah) return;
  const idx = ah.liked.findIndex(r => r.clipId === clipId);
  if (idx >= 0) {
    ah.liked.splice(idx, 1);
  } else {
    // Store a snapshot so /liked (Phase 4/6) can reopen the player from
    // the record alone, offline of a fresh search. Newest-first.
    ah.liked.unshift(Object.assign(AH_clipSnapshot(clip), {
      day: currentGameState.meta?.clock?.day ?? 1,
    }));
    if (ah.liked.length > AH_TUNING.likedCap) ah.liked.length = AH_TUNING.likedCap;
  }
  // The durable store lives in world.afterHours — flush it now so a like
  // survives even a hard reload before the next autosave (the browser
  // object alone used to carry it wholesale; the world sub-key needs an
  // explicit boundary to persist).
  saveAtBoundary('ah-like', currentGameState);
  AH_refresh();
}

function AH_shareClip(clip) {
  const url = AH_routeUrl('player', { clipId: clip.id });
  const text = `${clip.title} — ${url}`;
  const copied = () => AH_spawnToast(`Link copied: ${url}`);
  const fallback = () => AH_spawnToast(`Share link: ${url}`);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(copied, fallback);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (ok) copied(); else fallback();
  }
}

// Toast host: the PERSISTENT screen container (#computer-screen /
// #phone-screen), so toasts survive the per-render window-body and
// phone-content wipes — the interruption-bubble precedent. Phase 5 builds
// the full toast system (ads, ticker) on this exact machinery.
function AH_toastHost() {
  const app = document.getElementById('app');
  const mode = app?.getAttribute('data-mode');
  if (mode === 'phone') return document.getElementById('phone-screen');
  return document.getElementById('computer-screen');
}

function AH_spawnToast(text) {
  const host = AH_toastHost();
  if (!host) return;
  let layer = host.querySelector('.ah-toast-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'ah-toast-layer';
    host.appendChild(layer);
  }
  const toast = document.createElement('div');
  toast.className = 'ah-toast';
  toast.textContent = text;
  layer.appendChild(toast);
  // Handler-owned auto-dismiss timer (Locked decision 14) — never from a
  // render pass.
  setTimeout(() => toast.remove(), AH_TUNING.toastMs);
}

// ===== SECTION: AFTERHOURS — Phase 5: campy ad network + live ticker =====
// All of this is authored chrome (Locked decision 12) — ad copy, the
// "watching now" counter, countdowns. Nothing here is derived from the two
// APIs, so building it via innerHTML would be fine (invariant 2), but the
// pieces that the timer mutates are written via textContent / node swaps
// anyway.
//
// Autonomous animation (Locked decision 14): ONE AfterHours lifecycle
// interval drives ad rotation, ticker drift, and countdown resets. It is
// started idempotently from AH.render / AH.onSiteOpen (the shared renderer
// also covers Back/Forward/resume paths that never call a handler) and
// self-clears on its own tick the moment the site is no longer displayed
// anywhere (AH_siteLive — a state check, so power-off/window-close/phone-
// home all stop it, not just DOM wipes). Every render READS the module's
// live cursors (AH_adLive / AH_tickerVal), so a re-render never jumps the
// ad or the count; a reload re-derives the same seeded baseline.
let AH_lifecycleTimer = null;
const AH_adLive = { banner: -1, skyscraper: -1 };
let AH_tickerBase = 0;
let AH_tickerVal = 0;
let AH_tickCount = 0;
// The ticker's per-tick drift stream. Seeded from the save like every other
// piece of site chrome (Locked decision 11), so the sequence of wobbles is
// the save's own rather than the platform's — same reason the baseline and
// the ad rotation offsets are seeded. Re-armed by AH_ensureLifecycle.
let AH_tickerRng = () => 0.5;

function AH_adPool(slot) {
  return AH_ADS.filter(a => a.slot === slot);
}

// Seeded initial rotation offset per slot type — stable per save across
// reloads (Locked decision 11). Sub-keyed so banner and skyscraper don't
// share one stream.
function AH_adInitIndex(gs, slot) {
  const pool = AH_adPool(slot);
  if (!pool.length) return -1;
  const seed = gs?.world?.computer?.apps?.browser?.afterHoursSeed || String(gs?.meta?.seed || 'afterhours');
  return Math.floor(seededRng(seed, 'afterhours|ads:' + slot)() * pool.length);
}

// Is the AfterHours site currently DISPLAYED on either shell? State-derived
// (computer window open on the site view and powered on, or the phone's
// browser on the site view and powered and present). This is what lets the
// lifecycle interval self-clear on every close path without a bespoke close
// hook: navigate away (openSiteId changes), close the window, power off the
// computer, put the phone home/away.
function AH_siteLive() {
  const gs = currentGameState;
  const browser = gs?.world?.computer?.apps?.browser;
  if (!browser || browser.openSiteId !== 'afterhours') return false;
  const w = gs.world.computer;
  if (w.power === 'on' && w.windows?.browser && w.windows.browser.screenId === 'site') return true;
  const phone = gs.world.phone;
  if (!phone || phone.power !== 'on' || phonePresence(gs) === 'elsewhere') return false;
  if (phone.openAppId !== 'browser') return false;
  const top = phone.navStack?.[phone.navStack.length - 1];
  return !!top && top.appId === 'browser' && top.screenId === 'site';
}

function AH_stopLifecycle() {
  if (AH_lifecycleTimer != null) {
    clearInterval(AH_lifecycleTimer);
    AH_lifecycleTimer = null;
  }
  AH_adLive.banner = -1;
  AH_adLive.skyscraper = -1;
  AH_tickerBase = 0;
  AH_tickerVal = 0;
  AH_tickCount = 0;
  AH_tickerRng = () => 0.5;
}

// Guarded idempotent start — the sanctioned lifecycle pattern, never a
// render-scheduled timer (Locked decision 14): one interval, started once,
// self-clearing on close. Baseline + rotation offsets are seeded, so every
// open of the site in a save starts from the same place.
function AH_ensureLifecycle(gs) {
  if (AH_lifecycleTimer != null) return;
  const rng = AH_seedRng(gs);
  AH_tickerBase = Math.floor(6000 + rng() * 26000);
  AH_tickerVal = AH_tickerBase;
  AH_tickerRng = seededRng(
    gs?.world?.computer?.apps?.browser?.afterHoursSeed || String(gs?.meta?.seed || 'afterhours'),
    'afterhours|ticker',
  );
  if (AH_adLive.banner < 0) AH_adLive.banner = AH_adInitIndex(gs, 'banner');
  if (AH_adLive.skyscraper < 0) AH_adLive.skyscraper = AH_adInitIndex(gs, 'skyscraper');
  AH_lifecycleTimer = setInterval(AH_lifecycleTick, AH_TUNING.lifecycleMs);
}

function AH_lifecycleTick() {
  if (!AH_siteLive() || !document.querySelector('.ah-site-header')) {
    AH_stopLifecycle();
    return;
  }
  AH_tickCount++;
  // Rotate every live ad slot to its slot-type's next ad — but only every
  // `adRotateEveryTicks` ticks, so each ad gets a moment on screen and the
  // visitor ad's countdown visibly counts down before the ad rotates. The
  // rotation is read back by renders (AH_adLive), so a re-render
  // mid-rotation doesn't jump the ad.
  if (AH_tickCount % AH_TUNING.adRotateEveryTicks === 0) {
    for (const slot of ['banner', 'skyscraper']) {
      const pool = AH_adPool(slot);
      if (!pool.length) continue;
      const live = document.querySelectorAll(`.ah-ad-slot[data-slot="${slot}"]`);
      if (!live.length) continue;
      AH_adLive[slot] = (AH_adLive[slot] + 1) % pool.length;
      for (const el of live) {
        const frame = el.querySelector('.ah-ad-frame');
        if (frame) AH_renderAdInto(frame, pool[AH_adLive[slot]]);
      }
    }
  }
  // Drift the "watching now" count a little either way — a live number, not
  // a render-derived one (re-renders read AH_tickerVal, so no jump). The
  // drift draws from the save's own seeded stream, advanced one step per
  // tick, rather than Math.random: Locked decision 11 and design invariant 6
  // name this counter explicitly, and "no Math.random anywhere the chrome
  // could drift" has to mean the drift too, not just the baseline.
  const d = AH_TUNING.tickerDrift;
  AH_tickerVal = Math.max(AH_TUNING.tickerMinFloor, AH_tickerVal + Math.round(d.min + AH_tickerRng() * (d.max - d.min)));
  for (const el of document.querySelectorAll('.ah-ticker-count')) {
    el.textContent = AH_formatCount(AH_tickerVal);
  }
  // Countdown timers (the visitor ad) — count down each tick, reset when
  // they hit zero (and on each re-show, since the frame is rebuilt).
  for (const el of document.querySelectorAll('.ah-ad-countdown')) {
    const dur = parseInt(el.dataset.duration || '0', 10);
    let rem = parseInt(el.dataset.remaining || '0', 10);
    rem = rem <= 0 ? dur : rem - 1;
    el.dataset.remaining = String(rem);
    el.textContent = rem > 0 ? `Claim within ${rem}s` : 'Last chance!';
  }
}

// One ad slot — the durable frame ("Ad" label + fake ✕ + the ad body). The
// ✕ doesn't close the ad (you can't escape the ads); it swaps in the next
// one and resets its countdown, exactly like a real tube site's sad joke.
function AH_renderAdSlot(slot, gs) {
  AH_ensureLifecycle(gs);
  const pool = AH_adPool(slot);
  if (!pool.length) return document.createDocumentFragment();
  const slotEl = document.createElement('div');
  slotEl.className = `ah-ad-slot ah-ad-${slot}`;
  slotEl.setAttribute('data-slot', slot);
  const chrome = document.createElement('div');
  chrome.className = 'ah-ad-chrome';
  const label = document.createElement('span');
  label.className = 'ah-ad-label';
  label.textContent = 'Ad';
  chrome.appendChild(label);
  const close = document.createElement('button');
  close.className = 'ah-ad-close';
  close.textContent = '✕';
  close.title = "Close this ad (it'll be replaced by another one)";
  close.setAttribute('aria-label', 'Close ad');
  close.addEventListener('click', () => AH_swapSlotAd(slotEl));
  chrome.appendChild(close);
  slotEl.appendChild(chrome);
  const frame = document.createElement('div');
  frame.className = 'ah-ad-frame';
  slotEl.appendChild(frame);
  AH_renderAdInto(frame, pool[AH_adLive[slot] % pool.length]);
  return slotEl;
}

// The fake close button's "replacement ad" — rotate just this slot.
function AH_swapSlotAd(slotEl) {
  const slot = slotEl.getAttribute('data-slot');
  const pool = AH_adPool(slot);
  if (!pool.length) return;
  AH_adLive[slot] = (AH_adLive[slot] + 1) % pool.length;
  const frame = slotEl.querySelector('.ah-ad-frame');
  if (frame) AH_renderAdInto(frame, pool[AH_adLive[slot]]);
}

// Build the ad BODY for one entry into a frame element. Authored copy only
// (Locked decision 12) — no API strings, so node construction here is just
// belt-and-braces. Every handler stays inside the sandbox: the CTA toasts,
// never navigates.
function AH_renderAdInto(frame, ad) {
  const slotEl = frame.closest('.ah-ad-slot');
  if (slotEl) slotEl.setAttribute('data-kind', ad.kind || 'classic');
  frame.replaceChildren();
  if (ad.kind === 'update') {
    const win = document.createElement('div');
    win.className = 'ah-ad-update';
    const bar = document.createElement('div');
    bar.className = 'ah-ad-update-bar';
    bar.textContent = `${ad.emoji || '⬇'} ${ad.title || 'Software Update'}`;
    win.appendChild(bar);
    const bodyEl = document.createElement('div');
    bodyEl.className = 'ah-ad-update-body';
    const icon = document.createElement('span');
    icon.className = 'ah-ad-update-icon';
    icon.textContent = ad.emoji || '⬇';
    bodyEl.appendChild(icon);
    const txt = document.createElement('span');
    txt.textContent = ad.copy || '';
    bodyEl.appendChild(txt);
    const actions = document.createElement('span');
    actions.className = 'ah-ad-update-actions';
    const okBtn = document.createElement('button');
    okBtn.className = 'ah-ad-cta';
    okBtn.textContent = ad.ctaOk || 'OK';
    okBtn.addEventListener('click', () => AH_spawnToast('Update downloaded. Restart the browser to install. (You won\u2019t.)'));
    actions.appendChild(okBtn);
    const laterBtn = document.createElement('button');
    laterBtn.className = 'btn btn-secondary tiny';
    laterBtn.textContent = ad.ctaCancel || 'Cancel';
    laterBtn.addEventListener('click', () => { /* cancel does nothing — the joke */ });
    actions.appendChild(laterBtn);
    bodyEl.appendChild(actions);
    win.appendChild(bodyEl);
    frame.appendChild(win);
    return;
  }
  const emoji = document.createElement('span');
  emoji.className = 'ah-ad-emoji';
  emoji.textContent = ad.emoji || '➜';
  frame.appendChild(emoji);
  const copyEl = document.createElement('span');
  copyEl.className = 'ah-ad-copy';
  copyEl.textContent = ad.copy || '';
  frame.appendChild(copyEl);
  if (ad.kind === 'visitor') {
    const cd = document.createElement('span');
    cd.className = 'ah-ad-countdown';
    const dur = Math.max(2, AH_TUNING.adRotateEveryTicks);
    cd.dataset.duration = String(dur);
    cd.dataset.remaining = String(dur);
    cd.textContent = `Claim within ${dur}s`;
    frame.appendChild(cd);
  }
  const cta = document.createElement('button');
  cta.className = 'ah-ad-cta';
  cta.textContent = ad.cta || 'Click';
  cta.addEventListener('click', () => AH_spawnToast(`${ad.href || 'That site'} isn\u2019t real — it\u2019s a very fake ad. (Nice click, though.)`));
  frame.appendChild(cta);
}

// The live "watching now" counter — rendered into the site header so it's
// on every view. Emits the CURRENT live value (never re-derives it), so the
// lifecycle tick's drift survives re-renders without jumping.
function AH_renderTicker(gs) {
  AH_ensureLifecycle(gs);
  const el = document.createElement('span');
  el.className = 'ah-ticker';
  const dot = document.createElement('span');
  dot.className = 'ah-ticker-dot';
  dot.textContent = '●';
  el.appendChild(dot);
  const count = document.createElement('span');
  count.className = 'ah-ticker-count';
  count.textContent = AH_formatCount(AH_tickerVal);
  el.appendChild(count);
  const label = document.createElement('span');
  label.textContent = 'watching now';
  el.appendChild(label);
  return el;
}

function AH_renderNotFound(body, gs, site) {
  const browser = gs.world.computer.apps.browser;
  const url = browser.afterHoursView?.params?.url || 'this-page';
  const wrap = document.createElement('div');
  wrap.className = 'ah-404';
  const code = document.createElement('h3');
  code.textContent = '404 — Page not found';
  wrap.appendChild(code);
  const msg = document.createElement('p');
  msg.className = 'dim';
  msg.textContent = `afterhours.example/${url} doesn't exist. Maybe it never did.`;
  wrap.appendChild(msg);
  const homeBtn = document.createElement('button');
  homeBtn.className = 'btn';
  homeBtn.textContent = 'Back to Home';
  homeBtn.addEventListener('click', () => { ahNav('home', {}); AH_refresh(); });
  wrap.appendChild(homeBtn);
  body.appendChild(wrap);
}

function AH_renderFooter(gs) {
  const footer = document.createElement('div');
  footer.className = 'ah-footer';
  const copy = document.createElement('span');
  copy.className = 'ah-footer-copy';
  copy.textContent = '© 2006 AfterHours';
  footer.appendChild(copy);
  // Phase 7: the Hot Singles footer nav is REAL (unlike the dead links
  // below) — the section's secondary entry point.
  const hsLink = document.createElement('button');
  hsLink.className = 'ah-footer-link';
  hsLink.textContent = 'Hot Singles';
  hsLink.title = 'Hot Singles in your area';
  hsLink.addEventListener('click', () => { doAfterHoursHotSingles(); });
  footer.appendChild(hsLink);
  // Dead links: Phase 2 lands them on the 404 view ("this page doesn't
  // exist"); Phase 5's toast layer turns them into toasts.
  for (const slug of ['DMCA', 'Terms', 'Privacy', 'Contact', 'Careers']) {
    const link = document.createElement('button');
    link.className = 'ah-footer-link';
    link.textContent = slug;
    link.title = "This page doesn't exist.";
    link.addEventListener('click', () => { ahNav('404', { url: slug.toLowerCase() }); AH_refresh(); });
    footer.appendChild(link);
  }
  return footer;
}

// --- Shared helpers (relocated from RENDER.COMPUTER) ---

// Embed refusal fallback — shows a "Watch on site" link when the embed
// refuses to load. The clip URL is third-party API output, so it goes in a
// property, not innerHTML (Design invariant 2).
function showEmbedFallback(container, watchUrl) {
  container.innerHTML = '';
  const msg = document.createElement('p');
  msg.className = 'ah-error';
  msg.textContent = 'This video can\'t be embedded here.';
  container.appendChild(msg);
  if (watchUrl) {
    const link = document.createElement('button');
    link.className = 'btn tiny';
    link.textContent = 'Watch on site →';
    link.title = 'Open in new tab';
    link.addEventListener('click', () => window.open(watchUrl, '_blank', 'noopener,noreferrer'));
    container.appendChild(link);
  }
}

// Format view counts: 1234 -> 1.2K, 1234567 -> 1.2M
function formatViews(views) {
  if (!views) return '';
  if (views >= 1e6) return (views / 1e6).toFixed(1) + 'M views';
  if (views >= 1e3) return (views / 1e3).toFixed(1) + 'K views';
  return views + ' views';
}

// ===== SECTION: AFTERHOURS — handlers (relocated from UI.COMPUTER) =====
// The ui.js dispatch still calls these by name (browser.ah-* actions) — only
// where they live changed.

// Category tab → routed category view. AH_syncBrowseView resets the clip
// cache identity and refetches; the renderer shows the skeleton meanwhile.
// The home row cache is invalidated too, so returning home refetches fresh
// rows (and the cache never grows stale across category hops).
function doAfterHoursCategory(catId) {
  AH_ensureState(currentGameState);
  const browser = currentGameState.world.computer.apps.browser;
  AH_clearRowCache();
  ahNav('category', { catId });
  AH_refresh();
}

// Search bar submit → routed search view. An empty query returns to the
// current category's browse (the old "clear search" behavior).
function doAfterHoursSearch(query) {
  AH_ensureState(currentGameState);
  const browser = currentGameState.world.computer.apps.browser;
  const q = (query || '').trim();
  if (!q) {
    ahNav('category', { catId: browser.afterHoursCategory || 'featured' });
  } else {
    AH_recordSearch(currentGameState, q);
    ahNav('search', { query: q });
  }
  AH_refresh();
}

// Hot Singles (Phase 7) — navigate to the /hotsingles browse view.
function doAfterHoursHotSingles() {
  AH_ensureState(currentGameState);
  ahNav('hotsingles', {});
  AH_refresh();
}

// Open a single's profile view.
function doAfterHoursHotSingle(npcId) {
  AH_ensureState(currentGameState);
  if (!npcId || !currentGameState.npcs?.[npcId]) { doAfterHoursHotSingles(); return; }
  ahNav('hot-single', { npcId });
  AH_refresh();
}

// "Say hi" — the FREE meet-them flow (Hot Singles are not escorts; nothing
// is ever charged). Grants contact, records the met id, and delivers a
// seeded opening line into the phone's IM app via the same path tutorial
// milestones use (processNpcImMessages). Idempotent: a second click toasts
// instead of re-greeting. world.afterHours needs an explicit boundary to
// flush (the ah-like precedent), so saveAtBoundary fires immediately.
async function doAfterHoursSayHi(npcId) {
  const gs = currentGameState;
  if (!gs) return;
  AH_ensureState(gs);
  const npc = gs.npcs?.[npcId];
  const ah = gs.world?.afterHours ? gs.world.afterHours : (gs.world.afterHours = defaultAfterHoursState());
  if (!npc || !ah) return;
  const name = npc.bible?.name || 'They';
  if (npc.contactKnown || ah.metNpcIds.includes(npcId)) {
    AH_spawnToast(`You've already said hi to ${name} — check your phone.`);
    return;
  }
  npc.contactKnown = true;
  ah.metNpcIds = [...ah.metNpcIds, npcId];
  // Deliver the seeded opener as their first IM (the phone's IM app thread
  // gets an unread marker via processNpcImMessages). Guarded so synthetic/
  // test states without a computer can't throw — contact is still granted.
  if (gs.world?.computer?.apps?.im) {
    const line = AH_hotSingleOpeningLine(gs, npcId);
    processNpcImMessages(gs, [{ npcId, text: line }]);
  }
  AH_spawnToast(`You said hi to ${name} — they texted you!`);
  await saveAtBoundary('ah-say-hi', gs);
  // action-outcome-window-plan Phase 6 (D3): making contact on a dating site
  // is a real beat — who it is you've now met. The frame is reused per
  // person (their existing portrait vibe, D5).
  await presentActionOutcome(currentGameState, {
    id: 'ah.say-hi', label: 'Say Hi',
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      heading: `You said hi to ${name}`,
      image: { kind: 'archetype', variant: 'dating', phrase: 'swiping through a dating profile on a dating site, an opening message sent' },
    },
  }, { applied: [], narration: `You said hi to ${name} — they texted you!`, minutesSpent: 0 });
  AH_refresh();
}

// "Invite Over" (Phase 8) — the site's front door to real-world
// relationships. Mirrors the IM invite-over flow (doInviteOver, ui.js) with
// the AfterHours source tag: the visit carries sourceId 'ah_<npcId>_<day>'
// so narration reads them as "the person you met on AfterHours", and the
// guest follows the player through the common rooms (sim.js
// resolveVisitPresence reads the visit's followPlayer flag). Free — meeting
// them is never a service. The gating mirrors doInviteOver's so the site
// can toast in-place instead of relying on the narration log; the shared
// flow re-checks everything anyway.
async function doAfterHoursInviteOver(npcId) {
  const gs = currentGameState;
  if (!gs) return;
  AH_ensureState(gs);
  const npc = gs.npcs?.[npcId];
  if (!npc) return;
  const name = npc.bible?.name || 'They';
  if (npc.residency?.status === 'resident') {
    AH_spawnToast(`${name} already lives with you.`);
    return;
  }
  if (!npc.contactKnown) {
    AH_spawnToast(`Say hi to ${name} first — they won't come over cold.`);
    return;
  }
  const result = await doInviteOver(npcId, 'ah');
  // Report what actually happened rather than assuming: doInviteOver's gates
  // could still decline, so a confirmation is only toasts when it actually
  // scheduled (result.when carries the day+time the player picked).
  if (result?.ok) {
    AH_spawnToast(`${name} — the person you met on AfterHours — says they'll come by ${result.when || 'then'}.`);
  } else if (result?.reason) {
    AH_spawnToast(result.reason);
  }
  AH_refresh();
}

function doAfterHoursPage(direction) {
  const browser = currentGameState.world.computer.apps.browser;
  const currentPage = browser.afterHoursClipPage || 1;
  const newPage = Math.max(1, currentPage + (direction || 1));
  if (newPage === currentPage) return;
  browser.afterHoursClipPage = newPage;
  browser.afterHoursSourcePages = { ph: newPage, ep: newPage };
  browser.afterHoursClips = null;
  browser.afterHoursClipsLoading = false;
  browser.afterHoursClipsError = null;
  AH_refresh();
  fetchAfterHoursClips(browser.afterHoursCategory || 'featured');
}

// "Next Page" — advances both source cursors in lockstep and refetches.
function doAfterHoursRefresh() {
  const browser = currentGameState.world.computer.apps.browser;
  const catId = browser.afterHoursCategory || 'featured';
  browser.afterHoursClips = null;
  browser.afterHoursClipsLoading = false;
  browser.afterHoursClipsError = null;
  const nextPage = (browser.afterHoursClipPage || 1) + 1;
  browser.afterHoursClipPage = nextPage;
  browser.afterHoursSourcePages = { ph: nextPage, ep: nextPage };
  browser.afterHoursTotalPages = Math.max(nextPage + 1, browser.afterHoursTotalPages || 1);
  AH_refresh();
  fetchAfterHoursClips(catId);
}

// Site-header refresh — refetch the current page of the current browse
// identity (a true reload, unlike Next Page).
function doAfterHoursReload() {
  const browser = currentGameState.world.computer.apps.browser;
  if (browser.afterHoursView?.view === 'player') { AH_refresh(); return; }
  if (browser.afterHoursView?.view === 'home') {
    // A true refresh on home: drop the row cache so the guarded render-pass
    // kick refetches every section once.
    AH_clearRowCache();
    AH_refresh();
    return;
  }
  const catId = browser.afterHoursCategory || 'featured';
  browser.afterHoursClips = null;
  browser.afterHoursClipsLoading = false;
  browser.afterHoursClipsError = null;
  AH_refresh();
  fetchAfterHoursClips(catId);
}

// Switch which host's embed a blended clip plays from (PH / EP chips). The
// clip is still found by its id; only the selected source changes.
function doAfterHoursHost(source) {
  if (source !== 'ph' && source !== 'ep') return;
  const browser = currentGameState.world.computer.apps.browser;
  if (!browser.afterHoursWatching) return;
  const clip = AH_findClip(browser, browser.afterHoursWatching);
  if (!clip || !(clip.sources || []).includes(source)) return;
  browser.afterHoursHost = source;
  AH_refresh();
}

// Close the embed player — stop watching, end any session (the sanctioned
// kind of clear), and leave the player view back to the previous browse.
function doAfterHoursClose() {
  const browser = currentGameState.world.computer.apps.browser;
  browser.afterHoursWatching = null;
  if (browser.afterHoursSession) {
    browser.afterHoursSession = null;
    popTimeContext();
    pendingInterruption = null;
  }
  if (browser.afterHoursView?.view === 'player') {
    if (!ahBack()) ahNav('home', {});
  }
  AH_refresh();
}

// Enter masturbating state — no time cost yet. Sets the time context to
// 'masturbating' (3x scale — time crawls). The "Cum" button appears after
// a warmup period (MASTURBATION.warmupSeconds of real time).
function doAfterHoursMasturbate(device) {
  const browser = currentGameState.world.computer.apps.browser;
  if (!browser.afterHoursWatching) return;
  // Already going. Reachable without a double-click: isAfterHoursSessionActive
  // is DERIVED (pocket the phone mid-session and the button flips back to
  // "Masturbate" while the record survives), and re-entering would re-arm the
  // warmup deadline and fire a second interruption pre-generation — an extra
  // generateText call for a session already in progress.
  if (browser.afterHoursSession) return;
  if (device === 'phone' && phonePresence(currentGameState) !== 'here') {
    addLogEntry('system', 'Set the phone down somewhere you can use it first.');
    return;
  }
  browser.afterHoursSession = {
    device: device || 'computer',
    startedTick: clockToAbsolute(currentGameState.meta.clock),
  };
  browser.afterHoursWarmupUntilMs = Date.now() + MASTURBATION.warmupSeconds * 1000;
  pushTimeContext('masturbating');
  startInterruptionPreGeneration(currentGameState);
  AH_refresh();
  // One re-render when the warmup elapses, to flip the button live — a
  // handler-owned timer (the sanctioned lifecycle pattern), never one
  // scheduled from a render pass (Locked decision 14).
  setTimeout(() => {
    if (isAfterHoursSessionActive(currentGameState)) {
      AH_refresh();
    }
  }, MASTURBATION.warmupSeconds * 1000);
}

// Abort the session — no effects, no time. Return to browsing.
function doAfterHoursStop() {
  const browser = currentGameState.world.computer.apps.browser;
  browser.afterHoursSession = null;
  popTimeContext();
  pendingInterruption = null;
  AH_refresh();
}

// The climax action — the actual time + effects cost. Pauses the continuous
// clock, advances MASTURBATION.timeCostMinutes game-minutes, applies cum
// effects, then rolls the interruption check.
async function doAfterHoursCum() {
  const browser = currentGameState.world.computer.apps.browser;
  if (!isAfterHoursSessionActive(currentGameState)) return;
  showLoading();
  try {
    const minutes = MASTURBATION.timeCostMinutes;
    await advanceAndResolveMinutes(minutes);

    const site = SITE_DEFS['afterhours'];
    // audit finding #12: capture applyEffects' own return so the outcome
    // window below can read a genuine result instead of an empty stand-in
    // (Design Invariant 1) — hoisted out of the if-block since it's needed
    // after the interruption roll.
    let cumApplied = [];
    if (site?.cumEffects) {
      const effects = site.cumEffects.map(line => parseEffectDSL(line)[0]).filter(Boolean);
      const roomObjects = currentGameState.objects[`room_${currentGameState.player.location}`] || {};
      const effCtx = buildEffectContext(currentGameState, [], [], roomObjects, currentGameState.player.inventory || []);
      const cumResult = applyEffects(effects, effCtx);
      cumApplied = (cumResult && cumResult.applied) || [];
    }

    browser.afterHoursSession = null;
    popTimeContext();
    addLogEntry('narration', 'You finish, feeling a mix of relief and mild shame.');
    AH_refresh();
    render(currentGameState, currentSceneState);
    await saveAtBoundary('ah-cum', currentGameState);

    const result = rollInterruption(currentGameState);
    if (result) {
      await showInterruptionBubble(currentGameState, result.npcId, result.doorState);
    } else {
      pendingInterruption = null;
      // action-outcome-window-plan Phase 6 (D3): the climax resolves like
      // the intimacy act it redeems — a private beat with the effects already
      // applied. The frame is reused per device (D5); a caught interruption
      // above is its own window and wins the beat instead.
      await presentActionOutcome(currentGameState, {
        id: 'afterhours.cum', label: 'Alone',
        outcomeWindow: {
          tier: 'C', trigger: 'player', dismissal: 'tap',
          heading: 'A private moment',
          image: { kind: 'archetype', variant: 'alone', phrase: 'leaning back in a quiet room, a screen still glowing, catching your breath' },
        },
      }, { applied: cumApplied, narration: 'You finish, feeling a mix of relief and mild shame.', minutesSpent: MASTURBATION.timeCostMinutes });
    }
  } finally {
    hideLoading();
  }
}

// AfterHours content watch — applies no effects (browsing is free), sets the
// watched clip, navigates to the routed player view, and opens the embed.
// The player iframe loads the clip's chosen host embed (PH or EP), so
// there's no image-gen latency — just the iframe load time. Deliberately
// NOT triggered from inside a render pass (renders run multiple times per
// action).
async function doAfterHoursWatch(clipId, device) {
  if (!clipId) return;
  const browser = currentGameState.world.computer.apps.browser;
  // The clip may be in the browse grid, a session snapshot (Continue
  // Watching), or a home row cache entry — any card opens the player.
  const clip = AH_findClip(browser, clipId);
  if (!clip) return;

  const site = SITE_DEFS['afterhours'];
  if (!site?.adultContent) return;

  browser.afterHoursWatching = clipId;
  // Session-only watched stack + snapshots: a page-session convenience so
  // this session's cards resolve instantly. The DURABLE record is
  // world.afterHours.history (Phase 6), which AH_findClip falls back to — so
  // these living in module memory costs nothing across a reload.
  const stackIdx = AH_watchedStack.indexOf(clipId);
  if (stackIdx >= 0) AH_watchedStack.splice(stackIdx, 1);
  AH_watchedStack.unshift(clipId);
  AH_watchedStack.length = Math.min(AH_watchedStack.length, AH_TUNING.upNextCount * 2);
  AH_watchedSnapshots[clipId] = AH_clipSnapshot(clip);
  // Prune snapshots no longer reachable from the capped stack.
  for (const id of Object.keys(AH_watchedSnapshots)) {
    if (!AH_watchedStack.includes(id)) delete AH_watchedSnapshots[id];
  }
  // Phase 6: persist the watch — history + continueWatching live in
  // world.afterHours (survives reloads). The saveAtBoundary below flushes
  // the record immediately.
  AH_recordWatch(currentGameState, clip);
  addLogEntry('narration', `You start watching "${clip.title}" on AfterHours.`);
  await saveAtBoundary('ah-watch', currentGameState);
  // action-outcome-window-plan Phase 6 (D3): watching is a real, private
  // beat. Nothing numeric shifts (the mood lands at the end, if at all); the
  // frame is reused per site (D5).
  await presentActionOutcome(currentGameState, {
    id: 'browser.watch', label: 'Watch',
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      heading: 'AfterHours',
      image: { kind: 'archetype', variant: 'afterhours', phrase: 'watching a video on a glowing screen in a dim room, headphones on' },
    },
  }, { applied: [], narration: `You start watching "${clip.title}".`, minutesSpent: 0 });

  ahNav('player', { clipId });
  AH_refresh();

  // Scroll the player into view — the panel may sit below the fold. On the
  // phone the panel lives inside #phone-screen (the computer's is earlier
  // in the DOM, hidden, and would scroll the wrong container).
  const scope = device === 'phone' ? document.getElementById('phone-screen') : document;
  const panel = scope?.querySelector?.('#ah-watch-panel') || scope?.getElementById?.('ah-watch-panel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Home-row data pipeline (Phase 4) ---
// One blended search per home row / category tile, cached in the module-level
// AH_rowCache keyed `sectionId:page`. Idempotent by cache status (missing →
// 'fetching' → 'done'), so the guarded render-pass kick can never refetch or
// loop; a category change clears the whole cache so returning home refetches
// fresh rows. Lives in the async fetch path (never a render-scheduled timer —
// Locked decision 14).
function AH_kickRowFetch(sectionId, query, page) {
  const key = `${sectionId}:${page || 1}`;
  const entry = AH_rowCache[key];
  if (entry?.status === 'done') return;
  // A live 'fetching' entry is this session's in-flight fetch. One older than
  // the staleness window is a fetch that crashed without settling; drop it and
  // refetch rather than leave the section on skeletons forever.
  if (entry?.status === 'fetching') {
    if (typeof entry.startedAt === 'number' && Date.now() - entry.startedAt <= AH_TUNING.relatedStaleMs) return;
    delete AH_rowCache[key];
  }
  AH_rowCache[key] = { status: 'fetching', clips: null, error: null, startedAt: Date.now() };
  fetchRow(sectionId, query, page);
}

async function fetchRow(sectionId, query, page) {
  const key = `${sectionId}:${page || 1}`;
  try {
    const [phResult, epResult] = await Promise.allSettled([
      AH_SOURCES.ph.search(query, page || 1),
      AH_SOURCES.ep.search(query, page || 1),
    ]);
    // Cache cleared (category change) or superseded while in flight — discard.
    if (AH_rowCache[key]?.status !== 'fetching') return;
    const ph = phResult.status === 'fulfilled' ? phResult.value.videos : [];
    const ep = epResult.status === 'fulfilled' ? epResult.value.videos : [];
    const bothDown = phResult.status === 'rejected' && epResult.status === 'rejected';
    AH_rowCache[key] = {
      status: 'done',
      clips: blendResults({ ph, ep }),
      error: bothDown ? 'Couldn\'t load this row.' : null,
    };
  } catch (e) {
    if (AH_rowCache[key]) {
      AH_rowCache[key] = { status: 'done', clips: [], error: 'Couldn\'t load this row.' };
    }
  }
  // Rows are only displayed on the home view — no point refreshing anywhere else.
  const browser = currentGameState?.world?.computer?.apps?.browser;
  if (browser?.afterHoursView?.view === 'home') AH_refresh();
}

// Demand every home section + category tile that isn't cached yet.
function AH_kickHomeRows(gs) {
  const browser = gs?.world?.computer?.apps?.browser;
  if (!browser) return;
  for (const section of AH_TUNING.homeSections || []) {
    const query = AH_sectionQuery(browser, section);
    if (query != null) AH_kickRowFetch(section.id, query, 1);
  }
  const site = SITE_DEFS['afterhours'];
  for (const cat of site?.adultContent?.categories || []) {
    AH_kickRowFetch(`cat:${cat.id}`, cat.search === 'featured' ? '' : cat.search, 1);
  }
}

function AH_sectionQuery(browser, section) {
  if (section.query != null) return section.query;
  if (section.derived) return AH_recommendedQuery(browser);
  return null;
}

// Top keyword across the PERSISTED watch history — the personalisation
// signal for "Recommended for You" (Phase 6: reads world.afterHours.history,
// so the recommendation survives reloads). `browser` is kept for call-site
// symmetry; history records carry their own keywords or re-derive them from
// the title.
function AH_recommendedQuery(browser) {
  const ah = currentGameState?.world?.afterHours;
  const counts = {};
  for (const rec of (ah?.history || [])) {
    const kws = (Array.isArray(rec.keywords) && rec.keywords.length) ? rec.keywords : titleKeywords(rec.title);
    for (const kw of kws) {
      if (kw && kw.length > 2) counts[kw] = (counts[kw] || 0) + 1;
    }
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : null;
}

// Fetch clips from both content sources (Pornhub via superFetch, Eporner
// via direct fetch) in parallel, blend them into one seamless feed, and
// store the normalized clips in browser.afterHoursClips. Guards against the
// category having changed while the requests were in flight. Each source
// degrades independently: a rejection just yields an empty bucket, and only
// a total double-failure surfaces the error state. The skeleton stays up for
// at least AH_TUNING.skeletonMs so fast fetches don't strobe the grid.
async function fetchAfterHoursClips(catId) {
  const browser = currentGameState.world.computer.apps.browser;
  if (browser.afterHoursCategory !== catId) return; // player switched — discard
  if (browser.afterHoursClipsLoading) return;

  const site = SITE_DEFS['afterhours'];
  const cat = site?.adultContent?.categories.find(c => c.id === catId);
  if (!cat) return;

  browser.afterHoursClipsLoading = true;
  browser.afterHoursClipsError = null;
  browser.afterHoursSkeletonUntil = Date.now() + AH_TUNING.skeletonMs;
  AH_refresh();

  try {
    // Page cursor lives per-source (Phase 1); old saves fall back to the
    // UI-facing page number, which is kept in lockstep anyway.
    const page = browser.afterHoursSourcePages?.ph || browser.afterHoursClipPage || 1;
    const search = cat.search === 'featured' ? '' : cat.search;
    // Free-text search overrides the category search.
    const userQuery = (browser.afterHoursSearchQuery || '').trim();
    const query = userQuery || search;

    const [phResult, epResult] = await Promise.allSettled([
      AH_SOURCES.ph.search(query, page),
      AH_SOURCES.ep.search(query, page),
    ]);
    if (browser.afterHoursCategory !== catId) return; // stale

    const phVideos = phResult.status === 'fulfilled' ? phResult.value.videos : [];
    const epVideos = epResult.status === 'fulfilled' ? epResult.value.videos : [];
    let clips = blendResults({ ph: phVideos, ep: epVideos });
    // Stamp the browsing category so interruption's clip lookup keeps
    // working without its browser.afterHoursCategory fallback.
    clips = clips.map(c => ({ ...c, category: catId }));

    if (browser.afterHoursCategory !== catId) return; // stale
    browser.afterHoursClips = clips;
    browser.afterHoursSourcePages = { ph: page, ep: page };
    const sourceTotalPages = [
      phResult.status === 'fulfilled' ? phResult.value.totalPages : 1,
      epResult.status === 'fulfilled' ? epResult.value.totalPages : 1,
    ];
    browser.afterHoursTotalPages = Math.max(1, Math.min(AH_TUNING.maxTotalPages, ...sourceTotalPages));
    if (clips.length === 0 && phResult.status === 'rejected' && epResult.status === 'rejected') {
      browser.afterHoursClipsError = 'Failed to load clips. Try Refresh.';
    }
  } catch (e) {
    if (browser.afterHoursCategory === catId) {
      browser.afterHoursClipsError = 'Failed to load clips. Try Refresh.';
    }
  } finally {
    if (browser.afterHoursCategory === catId) {
      // Minimum skeleton display time. This timer lives in the async fetch
      // path (a handler, not a render pass), so it obeys Locked decision 14.
      const waitMs = (browser.afterHoursSkeletonUntil || 0) - Date.now();
      if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
      browser.afterHoursClipsLoading = false;
      AH_refresh();
    }
  }
}
