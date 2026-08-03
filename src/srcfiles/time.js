// ===== SECTION: TIME =====
// Continuous time-dilation clock. A rAF loop adds game-minutes to
// clock.minutes based on the current context's timeScale (browsing=10x,
// conversation=1x, idle=20x, etc). The NPC simulation runs at fixed
// checkpoints (every TIME_DILATION.simCheckpointMinutes of accumulated
// game-time), not once per player action.
//
// Discrete actions (sleep, work blocks, cum, every ACTION_DEFS verb) call
// advanceAndResolveMinutes() directly — it pauses the continuous loop,
// advances the clock by an exact number of minutes, runs a sim tick for
// each 30-minute boundary that span crosses, then resumes.
//
// Exactly one owner advances meta.clock per path, which is the invariant
// this file exists to hold:
//   - continuous path: clockFrame advances the clock; the checkpoint it
//     fires runs advanceAndResolve with { advanceClock: false }.
//   - discrete path:   the loop is paused, so resolveBatch advances the
//     clock per tick and advanceAndResolveMinutes settles the remainder.
// Both paths funnel day rollovers through markDayRolledOver/
// hasDayRolledOver so midnight is never processed twice.

// --- Context state ---
// The current time-flow context. Set by UI actions, read by the clock
// loop to pick the timeScale. Default 'idle'.
let currentTimeContext = 'idle';

// --- Clock loop state (private) ---
let clockLoopRunning = false;
let clockLastFrameMs = 0;
let clockAccumulatedMinutes = 0;  // game-minutes since last checkpoint
let clockRafId = null;
// Generation counter: every pause/stop bumps it, so any rAF callback still
// queued from an older generation recognises itself as stale and dies
// instead of re-scheduling. Without this, pausing mid-frame left an orphan
// chain alive that resumeClockLoop then ran *alongside* a fresh one, and
// the clock gained an extra chain (and an extra advance per frame) on every
// sim checkpoint.
let clockGeneration = 0;

// --- Context setters (called by UI actions) ---
function setTimeContext(ctx) {
  currentTimeContext = ctx;
}

function getTimeContext() {
  return currentTimeContext;
}

function getTimeScale() {
  const ctx = currentTimeContext;
  return TIME_DILATION.scales[ctx] ?? TIME_DILATION.scales.idle;
}

// --- Advance the clock by raw game-minutes (not ticks).
// Replaces advanceClock(clock, ticks) for the continuous path.
// Handles negative minutes by borrowing from `day` — the old version added
// 1440 without decrementing the day, silently gaining 24 hours.
function advanceClockMinutes(clock, minutes) {
  let { day, minutes: m } = clock;
  m += minutes;
  while (m >= 1440) {
    m -= 1440;
    day++;
  }
  while (m < 0) {
    m += 1440;
    day--;
  }
  return { day, weekday: getWeekday(day), minutes: m, phase: getPhase(m) };
}

// --- Absolute game-minute helpers ---
// The clock as a single monotonic number (day*1440 + minutes). Discrete
// actions compute their target in this space so the end time is exact and
// tick boundaries fall out of the arithmetic rather than being rounded to.
function clockToAbsolute(clock) {
  return clock.day * 1440 + clock.minutes;
}

function absoluteToClock(abs) {
  const day = Math.floor(abs / 1440);
  const m = abs - day * 1440;
  return { day, weekday: getWeekday(day), minutes: m, phase: getPhase(m) };
}

// --- The continuous clock loop (rAF-driven) ---
// Each frame: compute deltaMs, add deltaMs/1000 * timeScale/60 game-minutes
// to the accumulator. When the accumulator crosses simCheckpointMinutes,
// fire a sim checkpoint (run the NPC simulation for that duration).
// `gen` is the generation this callback was scheduled under. A callback
// whose generation no longer matches was scheduled before a pause/stop —
// it returns without re-scheduling, so the chain dies rather than living
// on beside the chain resumeClockLoop starts.
async function clockFrame(gen) {
  if (gen !== clockGeneration || !clockLoopRunning) return;
  if (!currentGameState) {
    clockRafId = requestAnimationFrame(() => clockFrame(gen));
    return;
  }

  // Freeze when tab hidden
  if (TIME_DILATION.freezeWhenHidden && document.hidden) {
    clockLastFrameMs = performance.now();
    clockRafId = requestAnimationFrame(() => clockFrame(gen));
    return;
  }

  const now = performance.now();
  const deltaMs = clockLastFrameMs ? now - clockLastFrameMs : 0;
  clockLastFrameMs = now;

  // Don't accumulate more than 1 minute of real time per frame (tab
  // was lagging, rAF stalled) — prevents huge time jumps
  const cappedDeltaMs = Math.min(deltaMs, 60000);

  const scale = getTimeScale();
  if (scale > 0 && cappedDeltaMs > 0) {
    // Game-minutes added this frame
    const gameMinutes = (cappedDeltaMs / 1000) * (scale / 60);
    clockAccumulatedMinutes += gameMinutes;

    // The continuous loop is the sole owner of meta.clock while it runs.
    // Checkpoints below simulate NPC ticks but must NOT advance the clock
    // again — resolveBatch used to do exactly that, adding a second 30
    // minutes per checkpoint and running the whole game at 2x speed.
    const prevDay = currentGameState.meta.clock.day;
    currentGameState.meta.clock = advanceClockMinutes(currentGameState.meta.clock, gameMinutes);
    updateClockDisplay();

    // Day rollover on the continuous path. resolveBatch's clock advance
    // used to be what made advanceAndResolve notice a new day; now that
    // checkpoints leave the clock alone, midnight has to be detected here
    // or rent/deliveries/quests would never fire while idling.
    if (currentGameState.meta.clock.day !== prevDay) {
      fireDayRollover(prevDay, currentGameState.meta.clock.day);
    }

    // Check if we've crossed a sim checkpoint
    if (clockAccumulatedMinutes >= TIME_DILATION.simCheckpointMinutes) {
      const checkpointMinutes = Math.floor(clockAccumulatedMinutes / TIME_DILATION.simCheckpointMinutes) * TIME_DILATION.simCheckpointMinutes;
      clockAccumulatedMinutes -= checkpointMinutes;

      // Run the checkpoint asynchronously — don't block the rAF.
      // fireSimCheckpoint is fire-and-forget; it sets a guard so
      // overlapping checkpoints don't happen.
      fireSimCheckpoint(checkpointMinutes);
    }
  }

  if (gen !== clockGeneration || !clockLoopRunning) return;
  clockRafId = requestAnimationFrame(() => clockFrame(gen));
}

// --- Day rollover on the continuous path (private) ---
// Guarded so a rollover can't be processed twice for the same day, and so
// an in-flight rollover doesn't overlap itself if the clock is running fast
// enough to cross two midnights while the first is still awaiting.
let rolloverInProgress = false;
let lastRolledOverDay = null;

async function fireDayRollover(fromDay, toDay) {
  if (rolloverInProgress) return;
  rolloverInProgress = true;
  try {
    for (let d = fromDay + 1; d <= toDay; d++) {
      if (lastRolledOverDay !== null && d <= lastRolledOverDay) continue;
      lastRolledOverDay = d;
      await processDayRollover(d);
    }
  } finally {
    rolloverInProgress = false;
  }
}

// Called by the discrete path (advanceAndResolve) so both paths share one
// "already handled this day" record and can't double-process a rollover.
function markDayRolledOver(day) {
  if (lastRolledOverDay === null || day > lastRolledOverDay) lastRolledOverDay = day;
}

function hasDayRolledOver(day) {
  return lastRolledOverDay !== null && day <= lastRolledOverDay;
}

// --- Sim checkpoint guard ---
let checkpointInProgress = false;
let pendingCheckpointMinutes = 0;

// Fire a sim checkpoint without blocking the rAF loop. If a checkpoint
// is already running, accumulate the minutes for the next one.
function fireSimCheckpoint(minutes) {
  if (checkpointInProgress) {
    pendingCheckpointMinutes += minutes;
    return;
  }
  runSimCheckpoint(minutes);
}

// Discrete-action companion to the continuous clock (sleep, work blocks,
// cum, every ACTION_DEFS verb). The clock ends at exactly `minutes` later
// — the sim's tick granularity no longer rounds the cost up.
//
// How many sim ticks that costs falls out of the arithmetic: a tick fires
// for each 30-minute boundary the span crosses. So a 15-minute action at
// 10:20 crosses 10:30 and costs one tick, while the same action at 10:00
// crosses nothing and costs none. Short actions are cheap on average
// without needing a separate carry variable — the clock itself is the
// carry. (Previously every action, from a 1-minute door lock to a
// 30-minute TV session, was rounded to exactly one tick = 30 minutes,
// which made all the per-minute tuning in defs.actions.js inert.)
//
// Returns the integer tick count (for callers that report ticksSpent).
async function advanceAndResolveMinutes(minutes) {
  const startAbs = clockToAbsolute(currentGameState.meta.clock);
  const targetAbs = startAbs + minutes;
  const ticks = Math.floor(targetAbs / CLOCK.tickMinutes) - Math.floor(startAbs / CLOCK.tickMinutes);

  if (ticks > 0) {
    // resolveBatch steps the clock one tick at a time so each tick's
    // schedule resolution sees the right time of day.
    await advanceAndResolve(ticks);
  }

  // Settle the clock on the exact target. resolveBatch lands on a tick
  // boundary, which is at most one tick away from where we actually want
  // to be, in either direction.
  currentGameState.meta.clock = absoluteToClock(targetAbs);

  currentGameState.player = decayPlayerNeeds(currentGameState.player, minutes / CLOCK.tickMinutes);
  return ticks;
}

async function runSimCheckpoint(minutes) {
  if (checkpointInProgress) {
    pendingCheckpointMinutes += minutes;
    return;
  }
  checkpointInProgress = true;
  try {
    // advanceClock: false — the rAF loop already moved meta.clock through
    // these minutes. This path only runs the NPC simulation over them.
    const ticks = Math.max(1, Math.round(minutes / CLOCK.tickMinutes));
    await advanceAndResolve(ticks, { advanceClock: false, fromClockLoop: true });
    currentGameState.player = decayPlayerNeeds(currentGameState.player, minutes / CLOCK.tickMinutes);
  } finally {
    checkpointInProgress = false;
    if (pendingCheckpointMinutes >= TIME_DILATION.simCheckpointMinutes) {
      const next = pendingCheckpointMinutes;
      pendingCheckpointMinutes = 0;
      runSimCheckpoint(next);
    }
  }
}

// --- Update the clock display in the header (smooth, without full render) ---
function updateClockDisplay() {
  if (!currentGameState) return;
  const m = Math.floor(currentGameState.meta.clock.minutes);
  const hdrTime = document.getElementById('hdr-time');
  if (hdrTime) hdrTime.textContent = formatTime(m);
  const hdrDay = document.getElementById('hdr-day');
  if (hdrDay) hdrDay.textContent = formatDate(currentGameState.meta.clock.day);
  const csClock = document.getElementById('cs-clock');
  if (csClock) csClock.textContent = `Day ${currentGameState.meta.clock.day} — ${formatTime(m)}`;
}

// --- Start/stop the clock loop ---
// Every entry point bumps clockGeneration so any frame still queued under
// the old generation retires itself instead of running beside the new one.
function startClockLoop() {
  if (clockLoopRunning) return;
  clockLoopRunning = true;
  clockLastFrameMs = performance.now();
  clockAccumulatedMinutes = 0;
  // Adopt the current day so a fresh session doesn't replay a rollover for
  // the day it loaded into.
  lastRolledOverDay = currentGameState?.meta?.clock?.day ?? null;
  const gen = ++clockGeneration;
  clockRafId = requestAnimationFrame(() => clockFrame(gen));
}

function stopClockLoop() {
  clockLoopRunning = false;
  clockGeneration++;
  if (clockRafId) {
    cancelAnimationFrame(clockRafId);
    clockRafId = null;
  }
}

// --- Pause/resume (for discrete actions that advance time directly) ---
function pauseClockLoop() {
  clockLoopRunning = false;
  clockGeneration++;
  if (clockRafId) {
    cancelAnimationFrame(clockRafId);
    clockRafId = null;
  }
}

function resumeClockLoop() {
  if (clockLoopRunning) return;
  clockLoopRunning = true;
  clockLastFrameMs = performance.now();
  const gen = ++clockGeneration;
  clockRafId = requestAnimationFrame(() => clockFrame(gen));
}

// ===== /SECTION: TIME =====
