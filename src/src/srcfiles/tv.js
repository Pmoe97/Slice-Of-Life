// ===== SECTION: TV =====
// What's On (0.14.2): the house television finally has something on it.
//
// Watching TV was one of the most common things anybody in the flat did — the
// watch_tv drive is an idle pastime every roommate falls back on, and the
// player's Watch TV verb was one of the first they found — and there was
// nothing to watch. The drive's line was "put the TV on"; the verb's was
// "Mindless, relaxing" or "neither of you is really following it". Streamly
// on the computer had thirteen named shows, but an episode was a counter.
//
// This module gives the shows a life and the house a shared screen:
//
//   1. SHOWS AIR.   Every show (STREAM_DEFS[*].tv) has seasons that drop
//                   weekly or all at once, with a hiatus between; each
//                   episode has a beat (TV_EPISODE_BEATS) — the mystery's
//                   second body, the baker who cries in the walk-in, the
//                   finale's killer. Derived from the day, never stored.
//   2. PEOPLE FOLLOW THEM.  Each roommate follows a few shows by taste
//                   (interests, temperament, a stable per-person jitter; the
//                   nurse who hate-watches the hospital drama) and has a
//                   place in each — world.tv.progress, one integer per show,
//                   the player's included. Fans start near the latest
//                   episode; nobody is at zero on a show they love.
//   3. ONE SCREEN.  The living room TV plays one thing (world.tv.nowPlaying).
//                   A roommate who sits down to watch TV — the drive, or the
//                   schedule tables' idle 'watching TV' — joins whatever is
//                   on, or puts on their next episode. Whoever was there for
//                   an episode has seen it. The player's Watch TV does the
//                   same: join what's on, or pick what the room can share.
//   4. SPOILERS.    A roommate who is ahead of you on a show you're watching,
//                   in a room with you, may let the latest episode slip —
//                   the real beat of the real episode — or catch themselves,
//                   by temperament. You'll know when you get there.
//   5. TALK.        The prompt carries what each roommate is hooked on, what
//                   just happened in it, and where you are relative to them,
//                   so conversation can go there.
//
// Invariant: this module decides WHAT is on, never WHETHER anyone watches.
// It reads the final location and activity sim.js already resolved and it
// rolls nothing on the tick's shared rng (per-purpose seededRng streams and
// pure hashes only), so every drive tally in the verify suite is unmoved.
// Its only writes are world.tv and the text of a watch_tv event it names the
// show in. Numbers in config.js (TV_TUNING); shows and beats in
// defs.computer.js.

// --- The catalog (pure) ----------------------------------------------------------

function tvShowDef(showId) {
  const def = (typeof STREAM_DEFS === 'object' && STREAM_DEFS) ? STREAM_DEFS[showId] : null;
  return def && def.tv ? def : null;
}

function tvShowIds() {
  return (typeof STREAM_DEFS_LIST !== 'undefined' ? STREAM_DEFS_LIST : []).filter(d => d && d.tv).map(d => d.id);
}

function tvHash(...parts) {
  return hashStr(parts.join('|'));
}

// Season s (0-based) premieres on this day.
function tvSeasonPremiere(def, s) {
  return def.tv.premiere + s * def.tv.cycleWeeks * 7;
}

// Episodes out on `day`, counted across every season (episode n is the n-th
// ever made). A weekly season adds one a week from its premiere; a full drop
// lands whole. Pure.
function tvReleasedCount(def, day) {
  if (!def || !def.tv || typeof day !== 'number' || !(def.tv.cycleWeeks > 0)) return 0;
  const T = def.tv;
  let n = 0;
  for (let s = 0; s < 1000; s++) {
    const p = tvSeasonPremiere(def, s);
    if (p > day) break;
    n += T.release === 'full' ? T.seasonEpisodes : Math.min(T.seasonEpisodes, Math.floor((day - p) / 7) + 1);
  }
  return n;
}

// The first day after `day` with something new out, or null. Pure.
function tvNextReleaseDay(def, day) {
  if (!def || !def.tv) return null;
  const now = tvReleasedCount(def, day);
  for (let d = day + 1; d <= day + def.tv.cycleWeeks * 7 + 8; d++) {
    if (tvReleasedCount(def, d) > now) return d;
  }
  return null;
}

function tvSeasonEpisode(def, n) {
  const E = def.tv.seasonEpisodes;
  return { season: Math.floor((n - 1) / E) + 1, episode: ((n - 1) % E) + 1 };
}

function tvEpisodeLabel(def, n) {
  const { season, episode } = tvSeasonEpisode(def, n);
  return `S${season} E${episode}`;
}

// "Thursday" / "tomorrow" — when a caught-up viewer gets the next one.
function tvWhenLabel(fromDay, day) {
  if (day == null) return null;
  if (day === fromDay + 1) return 'tomorrow';
  return `on ${WEEKDAY_NAMES[getWeekday(day)]}`;
}

// Which pool an episode draws from (see TV_EPISODE_BEATS' header).
function tvPosition(def, episode) {
  const E = def.tv.seasonEpisodes;
  if (def.tv.format === 'episodic') return episode === E ? 'finale' : 'any';
  if (episode === 1) return 'premiere';
  if (episode === E) return 'finale';
  if (episode === E - 1) return def.tv.format === 'competition' ? 'semifinal' : 'twist';
  return 'middle';
}

// One season's cast: strings as written, lists drawn once per season. A list
// steps one place per season from a per-show start, so a new season always
// brings a new victim, a new case, new bakers (until the list comes round
// again). Keys that name the SAME list draw without replacement from it,
// which is what keeps the red herring from also being the killer. Pure.
function tvSeasonCast(showId, season) {
  const cast = (typeof TV_EPISODE_BEATS === 'object' && TV_EPISODE_BEATS[showId]?.cast) || {};
  const out = {};
  const taken = new Map();
  for (const key of Object.keys(cast)) {
    const v = cast[key];
    if (!Array.isArray(v)) { out[key] = String(v); continue; }
    if (!v.length) continue;
    if (!taken.has(v)) taken.set(v, new Set());
    const used = taken.get(v);
    let i = (tvHash(showId, key) + Math.max(0, season - 1)) % v.length;
    for (let k = 0; k < v.length && used.has(i); k++) i = (i + 1) % v.length;
    used.add(i);
    out[key] = v[i];
  }
  return out;
}

// Fill the {tokens}, then capitalise any sentence a token now starts ("the
// widow's alibi…" → "The widow's alibi…"). Pure.
function tvFill(line, cast) {
  return String(line || '')
    .replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(cast, k) ? cast[k] : m))
    .replace(/(^|[.!?]\s+)([a-z])/g, (m, lead, ch) => lead + ch.toUpperCase());
}

// What happens in episode n. Within a season, a position's episodes walk its
// pool from a per-season offset, so no two episodes share a line (a pool is
// at least as long as its run — verify-tv.js); across seasons the offset,
// and the cast, move. Pure.
function tvEpisodeBeat(showId, n) {
  const def = tvShowDef(showId);
  const pools = typeof TV_EPISODE_BEATS === 'object' ? TV_EPISODE_BEATS[showId] : null;
  if (!def || !pools || !(n >= 1)) return '';
  const { season, episode } = tvSeasonEpisode(def, n);
  let pos = tvPosition(def, episode);
  if (!pools[pos] || !pools[pos].length) pos = def.tv.format === 'episodic' ? 'any' : 'middle';
  const pool = pools[pos] || [];
  if (!pool.length) return '';
  const first = pos === 'middle' ? 2 : 1;
  const idx = (tvHash(showId, season, pos) + Math.max(0, episode - first)) % pool.length;
  return tvFill(pool[idx], tvSeasonCast(showId, season));
}

// The beat as somebody would TELL it — the narrator's asides to you ("You cry
// a little too.", "…, and you get up to check the lock") dropped, since they
// aren't what happened. Pure.
function tvBeatTold(beat) {
  const kept = String(beat || '').split(/(?<=[.!?"])\s+/).filter(s => s && !/^You\b/.test(s))
    .map(s => s.replace(/,? and you\b[^.!?]*([.!?])$/, '$1'));
  return kept.join(' ') || String(beat || '');
}

// Does the living-room TV work? The same facility the player's Watch TV is
// gated on (computer.js's isFacilityFunctional; typeof-guarded, and an old
// save with no upgrade state reads as working, as it does there). Pure.
function tvScreenWorks(gs) {
  return typeof isFacilityFunctional !== 'function' || isFacilityFunctional(gs, TV_TUNING.facility);
}

function tvRuntime(showId) {
  return tvShowDef(showId)?.tv?.runtime || 45;
}

// --- Taste (pure) --------------------------------------------------------------

function tvNpcSeed(npc, npcId) {
  return String(npc?.bible?.genSeed ?? npc?.genSeed ?? npcId ?? 'npc');
}

function tvInterestNames(npc) {
  return (npc?.bible?.interests || []).map(i => (typeof i === 'string' ? i : i?.name)).filter(Boolean);
}

// How much this person likes this show: a stable per-person jitter, interest
// matches (capped), temperament leans and — for the job the show is about — a
// strong pull (they watch it to yell at it). Pure and derived, never stored:
// the same save always reproduces the same tastes (taste.js's discipline).
function tvAffinity(npc, npcId, showId) {
  const def = tvShowDef(showId);
  if (!def) return -Infinity;
  const T = TV_TUNING;
  const d = def.tv;
  const jitter = ((tvHash(tvNpcSeed(npc, npcId), showId, 'taste') % 10000) / 10000 * 2 - 1) * T.jitter;
  const names = tvInterestNames(npc);
  const hits = (d.interests || []).filter(x => names.includes(x)).length;
  const temper = npc?.bible?.temperament || {};
  let lean = 0;
  for (const [axis, w] of Object.entries(d.temper || {})) lean += w * (typeof temper[axis] === 'number' ? temper[axis] : 0);
  const prof = tvHateWatches(npc, showId) ? T.professionBonus : 0;
  return jitter + Math.min(T.interestCap, hits * T.interestWeight) + T.temperWeight * lean + prof;
}

function tvHateWatches(npc, showId) {
  const p = tvShowDef(showId)?.tv?.profession;
  return !!p && npc?.bible?.occupation?.category === p;
}

// The shows this person follows, favorite first: up to followCount above
// followMin, and never none. Pure.
function tvFollowedShows(npc, npcId) {
  const scored = tvShowIds().map(id => ({ id, a: tvAffinity(npc, npcId, id) }))
    .sort((x, y) => (y.a - x.a) || (x.id < y.id ? -1 : 1));
  const out = scored.filter(s => s.a >= TV_TUNING.followMin).slice(0, TV_TUNING.followCount).map(s => s.id);
  if (!out.length && scored.length) out.push(scored[0].id);
  return out;
}

// --- State ---------------------------------------------------------------------
// world.tv (SAVE_KEYS, additive default in state.js):
//   progress[viewer][show]    episodes seen, in order ('player' or an npc id)
//   lastWatched[viewer][show] day they last watched it
//   together[npcId][show]     day they last watched a new one with you
//   sittings[npcId]           { sinceAbs, showId } — sat down in front of it
//   nowPlaying                { showId, n, byId, startAbs, untilAbs, rerun,
//                               chain, credited[] } or null (the TV is off)
//   spoiled[show]             the furthest episode you already know about
//   spoiledBy[show]           who told you ('tv' = you saw it out of order)
//   spoilDay[npcId]           the day they last nearly/actually spoiled one
//   seeded[viewer]            day their starting places were written

function tvRead(gs) {
  const tv = gs?.world?.tv;
  return (tv && typeof tv === 'object') ? tv : null;
}

function ensureTv(gs) {
  const world = gs.world || (gs.world = {});
  const tv = (world.tv && typeof world.tv === 'object') ? world.tv : (world.tv = {});
  for (const k of ['progress', 'lastWatched', 'together', 'sittings', 'spoiled', 'spoiledBy', 'spoilDay', 'seeded']) {
    if (!tv[k] || typeof tv[k] !== 'object') tv[k] = {};
  }
  if (tv.nowPlaying === undefined) tv.nowPlaying = null;
  const day = gs?.meta?.clock?.day ?? 1;
  if (!tv.seeded.player) {
    // Streamly's resume points predate this module: the player's place in a
    // show is wherever they had got to there (never past what's out).
    const rp = gs?.world?.computer?.apps?.stream?.resumePoints || {};
    const mine = tv.progress.player || (tv.progress.player = {});
    if (!tv.lastWatched.player || typeof tv.lastWatched.player !== 'object') tv.lastWatched.player = {};
    for (const id of tvShowIds()) {
      if (typeof mine[id] !== 'number' && rp[id] > 0) mine[id] = Math.min(rp[id], tvReleasedCount(tvShowDef(id), day));
    }
    tv.seeded.player = day;
  }
  return tv;
}

// A roommate's starting place in a show they follow: a few episodes behind
// the latest at most, drawn once. Pure.
function tvInitialProgress(npc, npcId, showId, day) {
  if (!tvFollowedShows(npc, npcId).includes(showId)) return 0;
  const lags = TV_TUNING.seedLag;
  const lag = lags[tvHash(tvNpcSeed(npc, npcId), showId, 'lag') % lags.length] || 0;
  return Math.max(0, tvReleasedCount(tvShowDef(showId), day) - lag);
}

function tvSeedViewer(gs, tv, npcId, day) {
  if (tv.seeded[npcId]) return;
  const npc = gs.npcs?.[npcId];
  if (!npc) return;
  const mine = tv.progress[npcId] || (tv.progress[npcId] = {});
  for (const id of tvFollowedShows(npc, npcId)) {
    if (typeof mine[id] !== 'number') mine[id] = tvInitialProgress(npc, npcId, id, day);
  }
  tv.seeded[npcId] = day;
}

// Episodes seen. Before anything was written for them, what WOULD be written
// now (the player's Streamly place; a roommate's seeded start) — so a read
// before the first tick agrees with the write the first tick makes. Pure.
function tvProgress(gs, viewerId, showId) {
  const tv = tvRead(gs);
  const v = tv?.progress?.[viewerId]?.[showId];
  if (typeof v === 'number') return v;
  const day = gs?.meta?.clock?.day ?? 1;
  if (viewerId === 'player') {
    if (tv?.seeded?.player) return 0;
    const rp = gs?.world?.computer?.apps?.stream?.resumePoints?.[showId];
    return rp > 0 ? Math.min(rp, tvReleasedCount(tvShowDef(showId), day)) : 0;
  }
  if (tv?.seeded?.[viewerId]) return 0;
  const npc = gs?.npcs?.[viewerId];
  return npc ? tvInitialProgress(npc, viewerId, showId, day) : 0;
}

function tvSetProgress(gs, tv, viewerId, showId, n, day) {
  (tv.progress[viewerId] || (tv.progress[viewerId] = {}))[showId] = n;
  (tv.lastWatched[viewerId] || (tv.lastWatched[viewerId] = {}))[showId] = day;
}

// What a roommate is into right now: the shows they follow, favorite first,
// then anything they've picked up lately (usually from watching with you).
function tvNpcShows(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  if (!npc) return [];
  const out = tvFollowedShows(npc, npcId);
  const day = gs?.meta?.clock?.day ?? 1;
  const recent = tvRead(gs)?.lastWatched?.[npcId] || {};
  for (const id of Object.keys(recent).sort()) {
    if (!out.includes(id) && tvShowDef(id) && day - recent[id] <= TV_TUNING.activeDays && tvProgress(gs, npcId, id) > 0) out.push(id);
  }
  return out;
}

// What `npcId` would put on: their next unseen episode, favorite show first;
// caught up on everything, on some days, something new — usually whatever the
// rest of the flat is watching (word of mouth); failing that, an old episode
// of the first show they have anything of. Pure.
function tvNpcPick(gs, npcId, day, exceptShowId) {
  const shows = tvNpcShows(gs, npcId);
  for (const id of shows) {
    if (id === exceptShowId) continue;
    const p = tvProgress(gs, npcId, id);
    if (p < tvReleasedCount(tvShowDef(id), day)) return { showId: id, n: p + 1, rerun: false };
  }
  const discover = tvDiscoverShow(gs, npcId, day, shows);
  if (discover && discover !== exceptShowId) return { showId: discover, n: tvProgress(gs, npcId, discover) + 1, rerun: false, discovered: true };
  for (const id of shows) {
    const seen = Math.min(tvProgress(gs, npcId, id), tvReleasedCount(tvShowDef(id), day));
    if (seen > 0) return { showId: id, n: 1 + tvHash(npcId, id, day, 'rerun') % seen, rerun: true };
  }
  return null;
}

// A show a caught-up roommate might start today (discoverChance of days,
// drawn per person per day): one they aren't into yet with something out,
// scored by their own taste plus how many housemates are watching it. Pure.
function tvDiscoverShow(gs, npcId, day, current) {
  const T = TV_TUNING;
  if ((tvHash(npcId, day, 'discover') % 1000) >= T.discoverChance * 1000) return null;
  const npc = gs?.npcs?.[npcId];
  if (!npc) return null;
  const others = Object.keys(gs.npcs || {}).filter(id => id !== npcId && gs.npcs[id]?.residency?.status === 'resident');
  let best = null;
  for (const id of tvShowIds()) {
    if ((current || []).includes(id)) continue;
    if (tvProgress(gs, npcId, id) >= tvReleasedCount(tvShowDef(id), day)) continue;
    const buzz = others.filter(o => tvFollowedShows(gs.npcs[o], o).includes(id)).length;
    const score = tvAffinity(npc, npcId, id) + T.wordOfMouth * buzz;
    if (!best || score > best.score) best = { id, score };
  }
  return best ? best.id : null;
}

// How an episode lands for someone: new to them, seen it, or out of order.
function tvRelation(gs, viewerId, showId, n, rerun) {
  if (rerun) return 'rerun';
  const p = tvProgress(gs, viewerId, showId);
  if (p === n - 1) return 'fresh';
  return p >= n ? 'rewatch' : 'skip';
}

// --- The tick: the living-room screen -------------------------------------------
// Called once per resolveTick from sim.js on the FINAL locations/activities,
// like the house-notes pass. `tickEvents` is this tick's event list so far —
// a roommate who just sat down has their watch_tv event there, and it gets
// the show's name. Returns { events } (spoilers; nothing else is new).
function resolveTvTick(gs, npcUpdates, activeNpcIds, minutesThisTick, tickEvents) {
  const out = { events: [] };
  const clock = gs?.meta?.clock;
  if (!clock || !tvShowIds().length) return out;
  const T = TV_TUNING;
  const day = clock.day;
  const now = clockToAbsolute(clock);
  const tv = ensureTv(gs);

  const residents = [];
  const viewers = [];
  for (const id of activeNpcIds || []) {
    const npc = gs.npcs?.[id];
    if (!npc || npc.residency?.status !== 'resident') continue;
    tvSeedViewer(gs, tv, id, day);
    const u = npcUpdates?.[id] || {};
    const location = u.location !== undefined ? u.location : npc.location;
    const activity = u.activity !== undefined ? u.activity : npc.activity;
    residents.push({ id, location, activity });
    if (location === T.room && activity === T.viewingActivity) viewers.push(id);
  }
  viewers.sort();
  // A broken Living Room Setup plays nothing (the player's Watch TV is gated
  // on the same facility): whoever sits there is just sitting there, and the
  // shows wait until it's repaired. Seeding and spoilers above and below
  // don't need the screen.
  const viewing = new Set(tvScreenWorks(gs) ? viewers : []);

  // 1. Still on the sofa: seen now.
  for (const id of viewers) if (tv.sittings[id]) tv.sittings[id].lastAbs = now;

  // 2. Play the screen forward to now: every episode that has ended is
  //    credited to whoever was there at its midpoint — somebody who got up
  //    during this tick still saw the episode that ended during it — and
  //    something else comes on for whoever is still here.
  tvRunClock(gs, tv, now, day, viewing);

  // 3. Whoever got up has left the sofa.
  for (const id of Object.keys(tv.sittings)) if (!viewing.has(id)) delete tv.sittings[id];

  // 4. New viewers: join what's on, or put something on.
  for (const id of viewers) {
    if (!viewing.has(id) || tv.sittings[id]) continue;
    let np = tv.nowPlaying;
    const joined = !!np;
    if (!np) {
      const pick = tvNpcPick(gs, id, day);
      if (!pick) { tv.sittings[id] = { sinceAbs: now, lastAbs: now, showId: null }; continue; }
      np = tv.nowPlaying = {
        showId: pick.showId, n: pick.n, byId: id, startAbs: now, untilAbs: now + tvRuntime(pick.showId),
        rerun: pick.rerun, chain: 1, credited: [], ...(pick.discovered ? { discovered: true } : {}),
      };
    }
    tv.sittings[id] = { sinceAbs: now, lastAbs: now, showId: np.showId };
    tvNameTheShow(gs, tickEvents, id, np, joined);
  }

  // 5. Nobody on the sofa and it isn't yours: the TV goes off.
  const watching = Object.keys(tv.sittings).some(id => tv.sittings[id].showId);
  if (tv.nowPlaying && !watching && tv.nowPlaying.byId !== 'player') tv.nowPlaying = null;

  // 6. Somebody who's ahead of you, in a room with you.
  const spoiler = tvMaybeSpoil(gs, tv, residents, day, clock.minutes, minutesThisTick);
  if (spoiler) out.events.push(spoiler);
  return out;
}

function tvRunClock(gs, tv, now, day, viewing) {
  const T = TV_TUNING;
  for (let guard = 0; guard < 50 && tv.nowPlaying && tv.nowPlaying.untilAbs <= now; guard++) {
    const np = tv.nowPlaying;
    const mid = np.startAbs + (np.untilAbs - np.startAbs) * T.presentFraction;
    const credited = Array.isArray(np.credited) ? np.credited : [];
    if (!np.rerun) {
      for (const id of Object.keys(tv.sittings).sort()) {
        const s = tv.sittings[id];
        if (!s.showId || s.sinceAbs > mid || (s.lastAbs ?? s.sinceAbs) < mid || credited.includes(id)) continue;
        if (tvProgress(gs, id, np.showId) !== np.n - 1) continue;
        tvSetProgress(gs, tv, id, np.showId, np.n, day);
        credited.push(id);
        if (credited.includes('player')) (tv.together[id] || (tv.together[id] = {}))[np.showId] = day;
      }
    }
    // Who holds the remote now: whoever put it on, if they're still here,
    // else whoever has been sitting there longest.
    const seated = Object.keys(tv.sittings).filter(id => tv.sittings[id].showId && (!viewing || viewing.has(id)))
      .sort((a, b) => (tv.sittings[a].sinceAbs - tv.sittings[b].sinceAbs) || (a < b ? -1 : 1));
    if (!seated.length) { tv.nowPlaying = null; break; }
    const driver = seated.includes(np.byId) ? np.byId : seated[0];
    const next = tvContinue(gs, driver, np, day);
    if (!next) { tv.nowPlaying = null; break; }
    tv.nowPlaying = {
      ...next, byId: driver, startAbs: np.untilAbs, untilAbs: np.untilAbs + tvRuntime(next.showId), credited: [],
    };
    for (const id of seated) tv.sittings[id].showId = next.showId;
  }
}

// After an episode ends: the next one of the same show if it's new to whoever
// holds the remote, then their next show, up to maxChain new episodes in a
// row; after that (or with nothing new) an old episode plays in the
// background until everyone gets up. Pure.
function tvContinue(gs, driver, np, day) {
  const chain = (np.chain || 1) + 1;
  if (!np.rerun && chain <= TV_TUNING.maxChain) {
    const def = tvShowDef(np.showId);
    const p = tvProgress(gs, driver, np.showId);
    if (p === np.n && np.n + 1 <= tvReleasedCount(def, day)) return { showId: np.showId, n: np.n + 1, rerun: false, chain };
    const pick = tvNpcPick(gs, driver, day, np.showId);
    if (pick && !pick.rerun) return { ...pick, chain };
  }
  const seen = Math.min(tvProgress(gs, driver, np.showId), tvReleasedCount(tvShowDef(np.showId), day));
  if (seen > 0) return { showId: np.showId, n: 1 + tvHash(driver, np.showId, np.untilAbs, 'rerun') % seen, rerun: true, chain };
  const pick = tvNpcPick(gs, driver, day);
  return pick ? { ...pick, rerun: true, chain } : null;
}

// The roommate who just sat down: their watch_tv event (the drive's, this
// tick) says what they put on or joined. The weather clause stays when the
// drive told it with one ("…while the rain came down"). No new events — a
// roommate drifting in through the schedule tables has none to name.
function tvNameTheShow(gs, tickEvents, npcId, np, joined) {
  const evt = (tickEvents || []).find(e => e && e.npcId === npcId && e.type === 'watch_tv' && !(e.data && e.data.show));
  if (!evt) return;
  const def = tvShowDef(np.showId);
  if (!def) return;
  const label = def.label;
  const w = / while ([^.]+)\.?$/.exec(evt.template || '');
  const weather = w ? ` while ${w[1]}` : '';
  const data = { ...(evt.data || {}), show: np.showId };
  let line;
  if (joined && np.byId === 'player') {
    line = `{name} came in and settled onto the sofa to watch ${label} with you${weather}.`;
  } else if (joined && gs.npcs?.[np.byId]) {
    line = `{name} flopped down next to {other} for ${label}${weather}.`;
    data.other = np.byId;
  } else if (weather) {
    line = `{name} burrowed into the couch with ${label}${weather}.`;
  } else if (np.rerun) {
    line = `{name} put an old episode of ${label} on and sprawled across the couch.`;
  } else if (np.discovered && np.n === 1) {
    line = `{name} finally started ${label}, from the very first episode.`;
  } else if (np.discovered) {
    line = `{name} picked ${label} back up where they'd left it.`;
  } else {
    const lines = [
      `{name} put on the next ${label} and sprawled across the couch.`,
      `{name} put ${label} on (${tvEpisodeLabel(def, np.n)}) and got comfortable.`,
      `{name} claimed the couch for ${label}.`,
    ];
    line = lines[tvHash(npcId, np.showId, np.n) % lines.length];
  }
  evt.template = line;
  evt.data = data;
}

// --- Spoilers ------------------------------------------------------------------

// How likely they are to just SAY it: the volatile and assertive blurt, the
// conscientious and warm catch themselves. 0..1. Pure.
function tvBlurt(npc) {
  const S = TV_TUNING.spoiler;
  const t = npc?.bible?.temperament || {};
  const v = S.base + S.volatility * (t.volatility || 0) + S.assertiveness * (t.assertiveness || 0)
    - S.conscientiousness * (t.conscientiousness || 0) - S.warmth * (t.warmth || 0);
  return Math.max(0, Math.min(1, v));
}

// The show this roommate could spoil for you right now: one you're actively
// watching (seen at least one, watched within activeDays) where they're
// further along than you and further than you already know. Pure.
function tvSpoilableShow(gs, npcId, day) {
  const tv = tvRead(gs);
  let best = null;
  for (const id of tvShowIds()) {
    const p = tvProgress(gs, 'player', id);
    if (p < 1) continue;
    const lw = tv?.lastWatched?.player?.[id];
    if (typeof lw !== 'number' || day - lw > TV_TUNING.activeDays) continue;
    const q = tvProgress(gs, npcId, id);
    if (q <= p || (tv?.spoiled?.[id] || 0) >= q) continue;
    if (!best || q - p > best.gap) best = { showId: id, p, q, gap: q - p };
  }
  return best;
}

function tvMaybeSpoil(gs, tv, residents, day, minutes, minutesThisTick) {
  const room = gs.player?.location;
  if (!room || gs.player?.flags?._vulnerableState === 'sleeping') return null;
  const exclude = (typeof SHARED_ACTIVITY === 'object' && SHARED_ACTIVITY.excludeActivities) || [];
  for (const r of residents) {
    if (r.location !== room || tv.spoilDay[r.id] === day) continue;
    if (npcIsAsleep({ activity: r.activity }) || exclude.includes(r.activity || '')) continue;
    const s = tvSpoilableShow(gs, r.id, day);
    if (!s) continue;
    const rng = seededRng(gs.meta?.seed, `tv_spoil_${day}_${minutes}_${r.id}`);
    if (rng() >= chanceOverMinutes(TV_TUNING.spoiler.perMinute, minutesThisTick)) continue;
    tv.spoilDay[r.id] = day;
    const def = tvShowDef(s.showId);
    const pick = tvHash(r.id, s.showId, day);
    const base = { day, tick: getTickIndex(minutes), roomId: room, npcId: r.id, moodDelta: 0, seenByPlayer: false };
    if (tvBlurt(gs.npcs[r.id]) >= TV_TUNING.spoiler.blurtAt) {
      tv.spoiled[s.showId] = s.q;
      tv.spoiledBy[s.showId] = r.id;
      return { ...base, type: 'tv_spoiler', data: { show: s.showId }, template: tvSpoilerLine(def, s.p, s.q, pick) };
    }
    return { ...base, type: 'tv_near_spoiler', data: { show: s.showId }, template: tvNearSpoilerLine(def, pick) };
  }
  return null;
}

function tvSpoilerLine(def, p, q, pick) {
  const beat = tvBeatTold(tvEpisodeBeat(def.id, q));
  const qe = tvEpisodeLabel(def, q);
  const pe = tvEpisodeLabel(def, p);
  const lines = [
    `{name} is still buzzing about ${def.label}, and it all comes out before you can stop them. ${qe}: ${beat} You were only on ${pe}.`,
    `"Wait, have you got to the bit in ${def.label} where—" {name} tells you anyway. ${qe}: ${beat} You're on ${pe}.`,
    `{name} brings up ${def.label} like it's common knowledge. ${qe}: ${beat} You are, for the record, on ${pe}.`,
  ];
  return lines[pick % lines.length];
}

function tvNearSpoilerLine(def, pick) {
  const lines = [
    `{name} starts to say something about ${def.label}, sees your face, and mimes zipping their lips.`,
    `"Where are you up to in ${def.label}? No. Don't tell me. I won't say anything." {name} is visibly suffering.`,
    `{name} hums the ${def.label} theme at you, meaningfully, and refuses to explain.`,
  ];
  return lines[pick % lines.length];
}

// --- The player's Watch TV (defs.actions.js's self.watch_tv) --------------------

// Decided once in prepare, so the effect and the line can't disagree. If a
// roommate has something on, you join it. Otherwise the room picks: a show
// you and someone here are at the same point in; the one you've been
// watching; something they're into; whatever the whole house is talking
// about; and, failing all of that, an old sitcom. Pure.
function tvPlanPlayerWatch(gs, withIds) {
  const day = gs?.meta?.clock?.day ?? 1;
  const ids = tvShowIds();
  if (!ids.length) return null;
  const tv = tvRead(gs);
  const co = (withIds || []).filter(id => gs?.npcs?.[id]);
  // Only a screen somebody is still watching, mid-episode. One whose episode
  // has already ended is about to move on at the next tick; you pick instead.
  const now = gs?.meta?.clock ? clockToAbsolute(gs.meta.clock) : 0;
  const np = tv?.nowPlaying && tv.nowPlaying.untilAbs > now
    && Object.keys(tv.sittings || {}).some(id => tv.sittings[id]?.showId) ? tv.nowPlaying : null;
  let choice = null;
  if (np && tvShowDef(np.showId)) {
    choice = { mode: 'join', showId: np.showId, n: np.n, rerun: !!np.rerun, byId: np.byId };
  }
  const open = (id, viewer) => tvProgress(gs, viewer, id) < tvReleasedCount(tvShowDef(id), day);
  const lastSeen = (id) => tv?.lastWatched?.player?.[id] ?? -Infinity;
  if (!choice) {
    // Together: you and someone here are at the same place with a new one out.
    let best = null;
    for (const id of ids) {
      const p = tvProgress(gs, 'player', id);
      if (p < 1 || !open(id, 'player')) continue;
      const with_ = co.filter(c => tvProgress(gs, c, id) === p).length;
      if (with_ && (!best || with_ > best.with_ || (with_ === best.with_ && lastSeen(id) > lastSeen(best.id)))) best = { id, with_ };
    }
    if (best) choice = { mode: 'together', showId: best.id, n: tvProgress(gs, 'player', best.id) + 1, rerun: false };
  }
  if (!choice) {
    // Yours: the show you watched most recently with a new one out.
    const mine = ids.filter(id => tvProgress(gs, 'player', id) >= 1 && open(id, 'player') && lastSeen(id) > -Infinity)
      .sort((a, b) => lastSeen(b) - lastSeen(a));
    if (mine.length) choice = { mode: 'yours', showId: mine[0], n: tvProgress(gs, 'player', mine[0]) + 1, rerun: false };
  }
  if (!choice && co.length) {
    // Theirs: whoever's here puts on what they're into.
    const pick = tvNpcPick(gs, co[0], day);
    if (pick) choice = { mode: 'theirs', showId: pick.showId, n: pick.n, rerun: pick.rerun, byId: co[0] };
  }
  if (!choice) {
    // Buzz: the show most of the house follows; you start where you are.
    const fans = {};
    for (const id of Object.keys(gs?.npcs || {}).sort()) {
      if (gs.npcs[id]?.residency?.status !== 'resident') continue;
      for (const s of tvFollowedShows(gs.npcs[id], id)) (fans[s] || (fans[s] = [])).push(id);
    }
    const buzz = ids.filter(id => fans[id] && open(id, 'player'))
      .sort((a, b) => (fans[b].length - fans[a].length) || (a < b ? -1 : 1))[0];
    if (buzz) choice = { mode: 'buzz', showId: buzz, n: tvProgress(gs, 'player', buzz) + 1, rerun: false, fans: fans[buzz] };
  }
  if (!choice) {
    // Discover: flick around and land on something you haven't started.
    const fresh = ids.filter(id => tvProgress(gs, 'player', id) === 0 && tvReleasedCount(tvShowDef(id), day) > 0);
    if (fresh.length) {
      const id = fresh[tvHash('player', 'discover', day) % fresh.length];
      choice = { mode: 'discover', showId: id, n: 1, rerun: false };
    }
  }
  if (!choice) {
    const comfort = tvShowDef('the_neighborhood') ? 'the_neighborhood' : ids[0];
    const rel = tvReleasedCount(tvShowDef(comfort), day);
    if (rel < 1) return null;
    choice = { mode: 'comfort', showId: comfort, n: 1 + tvHash('player', comfort, day) % rel, rerun: true };
  }
  const def = tvShowDef(choice.showId);
  const relations = { player: tvRelation(gs, 'player', choice.showId, choice.n, choice.rerun) };
  for (const c of co) relations[c] = tvRelation(gs, c, choice.showId, choice.n, choice.rerun);
  const next = tvNextReleaseDay(def, day);
  return {
    ...choice,
    label: def.label,
    ep: tvEpisodeLabel(def, choice.n),
    playerEp: tvEpisodeLabel(def, Math.max(1, tvProgress(gs, 'player', choice.showId))),
    playerAt: tvProgress(gs, 'player', choice.showId),
    beat: tvEpisodeBeat(choice.showId, choice.n),
    finale: tvPosition(def, tvSeasonEpisode(def, choice.n).episode) === 'finale',
    latest: choice.n === tvReleasedCount(def, day),
    nextWhen: tvWhenLabel(day, next),
    // The episode somebody told you about (or you saw out of order) is the
    // one you already know — reaching it is when that pays off.
    spoiledBy: tv?.spoiled?.[choice.showId] === choice.n ? (tv?.spoiledBy?.[choice.showId] || null) : null,
    format: def.tv.format,
    hateWatchers: co.filter(c => tvHateWatches(gs.npcs[c], choice.showId)),
    relations,
    withIds: co,
  };
}

// The TV_WATCH effect's writer (effects.js). Everyone who saw a new episode
// has seen it; the screen is yours for the half hour, and whoever sits down
// in it joins you.
function tvApplyPlayerWatch(gs, showId, n, rerun, withIds, minutes) {
  const def = tvShowDef(showId);
  if (!def || !(n >= 1)) return;
  const tv = ensureTv(gs);
  const day = gs.meta.clock.day;
  const now = clockToAbsolute(gs.meta.clock);
  const credited = [];
  const rel = tvRelation(gs, 'player', showId, n, rerun);
  if (rel === 'fresh') { tvSetProgress(gs, tv, 'player', showId, n, day); credited.push('player'); }
  else {
    (tv.lastWatched.player || (tv.lastWatched.player = {}))[showId] = day;
    if (rel === 'skip' && (tv.spoiled[showId] || 0) < n) { tv.spoiled[showId] = n; tv.spoiledBy[showId] = 'tv'; }
  }
  for (const id of withIds || []) {
    if (!gs.npcs?.[id]) continue;
    tvSeedViewer(gs, tv, id, day);
    const r = tvRelation(gs, id, showId, n, rerun);
    if (r === 'fresh') { tvSetProgress(gs, tv, id, showId, n, day); credited.push(id); }
    if (r === 'fresh' && (rel === 'fresh' || rel === 'rewatch')) (tv.together[id] || (tv.together[id] = {}))[showId] = day;
  }
  const np = tv.nowPlaying;
  if (np && np.showId === showId && np.n === n && np.untilAbs > now) {
    np.credited = [...new Set([...(np.credited || []), ...credited])];
  } else {
    tv.nowPlaying = {
      showId, n, byId: 'player', startAbs: now, untilAbs: now + Math.max(1, minutes || ACTION_TUNING.tvMinutes),
      rerun: !!rerun, chain: 1, credited,
    };
  }
}

function tvNames(gs, ids) {
  const names = (ids || []).map(id => gs?.npcs?.[id]?.bible?.name || 'your roommate');
  if (names.length <= 1) return names[0] || 'your roommate';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// The Watch TV line, from the plan alone (it was decided before anything
// moved). Company is named here rather than by the shared templates: who
// you watched it with and what you watched are one sentence. Pure.
function tvWatchNarration(gs, plan) {
  if (!plan) return null;
  const co = plan.withIds || [];
  const names = co.length ? tvNames(gs, co) : '';
  const by = plan.byId && gs?.npcs?.[plan.byId] ? gs.npcs[plan.byId].bible?.name || 'your roommate' : null;
  const show = plan.label;
  const pr = plan.relations?.player;
  let open;
  if (plan.mode === 'join') {
    open = plan.rerun
      ? `${by || names || 'Somebody'} has an old ${show} on. You sit down and let it happen.`
      : `${by || names || 'Somebody'} already has ${show} on. You squeeze onto the sofa for ${plan.ep}.`;
  } else if (plan.mode === 'together') {
    open = `You and ${names} put on the next ${show}: ${plan.ep}.`;
  } else if (plan.mode === 'yours') {
    open = co.length ? `You put on the next ${show} (${plan.ep}), and ${names} ${co.length > 1 ? 'stay' : 'stays'} to watch.` : `You put on the next ${show}: ${plan.ep}.`;
  } else if (plan.mode === 'theirs') {
    open = plan.rerun
      ? `${by || names} puts on an old ${show} and you get swept along.`
      : `${by || names} puts on ${show} (${plan.ep}), and you get swept along.`;
  } else if (plan.mode === 'buzz') {
    const fans = plan.fans || [];
    const who = fans.length === 1 ? `${gs?.npcs?.[fans[0]]?.bible?.name || 'Your roommate'} won't stop talking about ${show}`
      : `Everybody in the flat keeps talking about ${show}`;
    open = pr === 'fresh' && plan.n === 1 ? `${who}, so you finally start it.` : `${who}, so you put on the next one: ${plan.ep}.`;
  } else if (plan.mode === 'discover') {
    open = `You flick through the channels and land on the very first ${show}.`;
  } else {
    open = `Nothing new is calling to you, so you put on an old ${show} and let it wash over you.`;
  }
  const parts = [open];
  if (plan.beat) parts.push(plan.beat);
  if (pr === 'fresh' && plan.spoiledBy) {
    const who = plan.spoiledBy === 'tv' ? null : (gs?.npcs?.[plan.spoiledBy]?.bible?.name || null);
    parts.push(who ? `You already knew. Thanks, ${who}.` : 'You already knew how this one goes, having seen it out of order.');
  }
  if (pr === 'skip') {
    parts.push(plan.playerAt >= 1 ? `You're only on ${plan.playerEp}, so that was out of order, and now you know things.`
      : "You haven't even started it, so that was out of order, and now you know things.");
  }
  if (pr === 'rewatch') parts.push("You've seen this one. It holds up.");
  const freshCo = co.filter(c => plan.relations?.[c] === 'fresh');
  const rewatchCo = co.filter(c => plan.relations?.[c] === 'rewatch');
  const lostCo = co.filter(c => plan.relations?.[c] === 'skip');
  const both = freshCo.length > 1 ? 'all of you' : 'both of you';
  if (pr === 'fresh' && freshCo.length) {
    if (plan.finale) parts.push('The finale. Nobody on the sofa says a word until the credits.');
    else if (plan.format === 'serial') parts.push(`${freshCo.length > 1 ? 'None of you saw' : 'Neither of you saw'} that coming.`);
    else if (plan.format === 'competition') parts.push(`It turns out ${both} have very strong opinions about the judging.`);
    else parts.push(`${tvNames(gs, freshCo)} ${freshCo.length > 1 ? 'laugh' : 'laughs'} at all the same bits you do.`);
  }
  if (pr === 'fresh' && rewatchCo.length) {
    parts.push(`${tvNames(gs, rewatchCo)} ${rewatchCo.length > 1 ? 'have' : 'has'} seen it already and ${rewatchCo.length > 1 ? 'spend' : 'spends'} the whole episode watching your face.`);
  }
  if (lostCo.length && plan.mode !== 'join' && plan.mode !== 'theirs') {
    parts.push(`${tvNames(gs, lostCo)} ${lostCo.length > 1 ? "haven't" : "hasn't"} seen the episodes before this one and ${lostCo.length > 1 ? 'ask' : 'asks'} a lot of questions.`);
  }
  // The one who does this for a living, every so often (not every episode).
  const h = (plan.hateWatchers || [])[0];
  if (h && tvHash(h, plan.showId, plan.n, 'gripe') % 2 === 0) {
    const who = gs?.npcs?.[h]?.bible?.name || 'Your roommate';
    const gripes = [
      `${who} explains, at length, everything the show gets wrong about their job.`,
      `"Nobody in my line of work would ever do that," says ${who}, for the third time.`,
      `${who} pauses it twice to point out what would actually happen.`,
    ];
    parts.push(gripes[tvHash(h, plan.n) % gripes.length]);
  }
  if (pr === 'fresh' && plan.latest && plan.nextWhen) parts.push(`That's the latest one. The next drops ${plan.nextWhen}.`);
  else if (pr === 'fresh' && plan.finale) parts.push("That's the season.");
  return parts.join(' ');
}

// --- Streamly (computer.js's watchEpisode) --------------------------------------

// Your next episode on the computer, or — caught up — the latest again.
// Returns { ok, show, episode, line } and writes your place.
function tvStreamWatch(gs, showId) {
  const def = tvShowDef(showId);
  if (!def) return null;
  const tv = ensureTv(gs);
  const day = gs.meta.clock.day;
  const released = tvReleasedCount(def, day);
  if (released < 1) {
    const when = tvWhenLabel(day, tvNextReleaseDay(def, day));
    return { ok: false, reason: `${def.label} hasn't started yet${when ? ` — it premieres ${when}` : ''}.` };
  }
  const p = tvProgress(gs, 'player', showId);
  const fresh = p < released;
  const n = fresh ? p + 1 : Math.max(1, Math.min(p, released));
  const spoiledBy = fresh && tv.spoiled[showId] === n ? (tv.spoiledBy[showId] || null) : null;
  if (fresh) tvSetProgress(gs, tv, 'player', showId, n, day);
  else (tv.lastWatched.player || (tv.lastWatched.player = {}))[showId] = day;
  const ep = tvEpisodeLabel(def, n);
  const parts = [fresh ? `You watch ${def.label}, ${ep}.` : `You're caught up on ${def.label}, so you watch ${ep} again.`];
  const beat = tvEpisodeBeat(showId, n);
  if (beat) parts.push(beat);
  if (spoiledBy) {
    const who = spoiledBy === 'tv' ? null : gs.npcs?.[spoiledBy]?.bible?.name;
    parts.push(who ? `You already knew. Thanks, ${who}.` : 'You already knew how this one goes.');
  }
  if (fresh && n === released) {
    const when = tvWhenLabel(day, tvNextReleaseDay(def, day));
    if (when) parts.push(`That's the latest one. The next drops ${when}.`);
  }
  // Who in the flat you just overtook — the other side of a spoiler.
  if (fresh) {
    const behind = Object.keys(gs.npcs || {}).filter(id => gs.npcs[id]?.residency?.status === 'resident'
      && tvNpcShows(gs, id).includes(showId) && tvProgress(gs, id, showId) === n - 1);
    if (behind.length) parts.push(`${tvNames(gs, behind)} ${behind.length > 1 ? "haven't" : "hasn't"} seen this one yet. Careful.`);
  }
  return { ok: true, show: def, episode: n, line: parts.join(' ') };
}

// The Streamly card's second line: where the show is, where you are, and who
// in the flat watches it. Pure.
function tvStreamCardMeta(gs, showId) {
  const def = tvShowDef(showId);
  if (!def) return '';
  const day = gs?.meta?.clock?.day ?? 1;
  const released = tvReleasedCount(def, day);
  const bits = [];
  if (released < 1) {
    const when = tvWhenLabel(day, tvNextReleaseDay(def, day));
    bits.push(when ? `premieres ${when}` : 'coming soon');
  } else {
    const latest = tvSeasonEpisode(def, released);
    bits.push(`S${latest.season} · ${latest.episode} of ${def.tv.seasonEpisodes} out`);
    // A finished season with the next one close enough to wait for.
    const nextDay = tvNextReleaseDay(def, day);
    const premiere = latest.episode === def.tv.seasonEpisodes && nextDay != null && nextDay - day <= 21;
    if (premiere) bits.push(`S${latest.season + 1} premieres ${tvWhenLabel(day, nextDay)}`);
    const p = tvProgress(gs, 'player', showId);
    if (p >= released) {
      const when = premiere ? null : tvWhenLabel(day, nextDay);
      bits.push(when ? `caught up · next ${when}` : 'caught up');
    } else if (p >= 1) bits.push(`you're on ${tvEpisodeLabel(def, p)} · ${released - p} new`);
  }
  const fans = Object.keys(gs?.npcs || {}).filter(id => gs.npcs[id]?.residency?.status === 'resident' && tvNpcShows(gs, id).includes(showId));
  if (fans.length) bits.push(`${tvNames(gs, fans)} ${fans.length > 1 ? 'watch' : 'watches'} this`);
  return bits.join(' · ');
}

// --- What the room shows ---------------------------------------------------------

// "watching Murder, Actually" for a roommate on the sofa with it on;
// the activity unchanged otherwise. Pure.
function tvActivityLabel(gs, npcId, activity) {
  if (activity !== TV_TUNING.viewingActivity) return activity;
  const s = tvRead(gs)?.sittings?.[npcId];
  const def = s?.showId ? tvShowDef(s.showId) : null;
  return def ? `watching ${def.label}` : activity;
}

// "The TV is on: Murder, Actually, S2 E4." in the living room, or null. Pure.
function tvRoomLine(gs, roomId) {
  if (roomId !== TV_TUNING.room) return null;
  const tv = tvRead(gs);
  const np = tv?.nowPlaying;
  const def = np ? tvShowDef(np.showId) : null;
  if (!def) return null;
  const now = gs?.meta?.clock ? clockToAbsolute(gs.meta.clock) : 0;
  const someone = Object.keys(tv.sittings || {}).some(id => tv.sittings[id]?.showId) || (np.byId === 'player' && np.untilAbs > now);
  if (!someone) return null;
  return np.rerun ? `The TV is on: an old episode of ${def.label}.` : `The TV is on: ${def.label}, ${tvEpisodeLabel(def, np.n)}.`;
}

// --- The conversation prompt (llm.js's buildNpcBlockV2) --------------------------

// [Watching]: what they're hooked on, what just happened in it (so they can
// talk about it), and where you are — behind (spoiler territory), ahead, or
// level (and whether you've been watching it together). Residents only.
function tvPromptLine(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  if (!npc || npc.residency?.status !== 'resident' || !tvShowIds().length) return null;
  const day = gs?.meta?.clock?.day ?? 1;
  const name = npc.bible?.name || 'They';
  const shows = tvNpcShows(gs, npcId).filter(id => tvProgress(gs, npcId, id) > 0);
  if (!shows.length) return null;
  const main = shows[0];
  const def = tvShowDef(main);
  const n = tvProgress(gs, npcId, main);
  let line = `[Watching]: ${name} is hooked on ${def.label} (${def.genre})`;
  if (tvHateWatches(npc, main)) line += `, mostly to pick apart what it gets wrong about their job`;
  line += `. Seen up to ${tvEpisodeLabel(def, n)}, in which: ${tvBeatTold(tvEpisodeBeat(main, n))}`;
  const also = shows.slice(1, 3).map(id => tvShowDef(id).label);
  if (also.length) line += ` Also watching ${also.join(' and ')}.`;
  const tv = tvRead(gs);
  for (const id of shows.slice(0, 3)) {
    const p = tvProgress(gs, 'player', id);
    const lw = tv?.lastWatched?.player?.[id];
    if (p < 1 || typeof lw !== 'number' || day - lw > TV_TUNING.activeDays) continue;
    const q = tvProgress(gs, npcId, id);
    const label = tvShowDef(id).label;
    if (q > p) line += ` The player is watching ${label} too but is ${q - p} episode${q - p > 1 ? 's' : ''} behind ${name}. Spoilers would land badly.`;
    else if (p > q) line += ` The player is ahead of ${name} on ${label}, and ${name} would hate to have it spoiled.`;
    else line += ` ${name} and the player are at the same point in ${label}${tv?.together?.[npcId]?.[id] ? ' and have been watching it together' : ''}.`;
    break;
  }
  const rel = tvReleasedCount(def, day);
  if (n >= rel && def.tv.release === 'weekly') {
    const when = tvWhenLabel(day, tvNextReleaseDay(def, day));
    if (when) line += ` The next ${def.label} drops ${when}.`;
  }
  return line;
}
