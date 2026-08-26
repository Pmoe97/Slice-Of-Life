// ===== SECTION: DREAMS =====
// Dream Engine (src/ref/complete/dream-engine-plan.md). Occasionally, sleeping or
// napping greets the player with a 1-3 panel illustrated dream compiled
// deterministically from their own save: who they snooped on, who they slept
// with, what an NPC did in a room they never entered.
//
// The pipeline, in dependency order (one phase per session):
//   harvestResidue  (Phase 3) — save -> scored pool of dreamable fragments
//   compileDream    (Phase 4) — seeded selection from defs.dreams.js' tables
//   callDreamweaver (Phase 5) — the LLM writes prose INTO the finished skeleton
//   getDreamPanelImage (Phase 6) — panels render in the background, sequentially
//   presentDream    (Phase 7) — a single action-window session, panel cursor
//
// Three rules this file lives under, none of them negotiable:
//
//  1. **Reads everything, writes nothing.** The knowledge system, the
//     relationship axes and the NPC memory model are strictly READ-ONLY from
//     here. D7 lets a dream draw on things the player never witnessed - an
//     NPC's bad day, a conversation in a room the player wasn't in - and that
//     omniscience is only safe because of this asymmetry: the player gains a
//     suspicion, never a fact. The only writes a dream may ever make are the
//     wake tint through applyEffects (D12) and this engine's own bookkeeping
//     inside world.dreams.
//  2. **Its own RNG stream.** The compiler draws from
//     seededRng(gs.meta.seed, hashStr('dream|' + index)) and NEVER the global
//     stream. A mid-stream draw from the shared sequence shifts every existing
//     seed's cast - the standing determinism invariant.
//  3. **Never generate on the sleep click.** Dreams are compiled, written and
//     rendered in the background and parked in world.dreams.queue (D19). An
//     empty queue means no dream tonight, silently. A dream that hung the
//     sleep button would be the loud version of castWeb's silent failure.
//
// LANDED SO FAR: the state shape and registration (Phase 1), the component
// tables in defs.dreams.js (Phase 2), the residue harvester (Phase 3), the
// compiler (Phase 4), the writer's pure half (Phase 5 -
// parseDreamweaverReply / buildDreamFallback / applyDreamPanelText, with the
// call itself in llm.js), the background pipeline (Phase 6 -
// topUpDreamQueue / dreamStillValid / nextDreamSlot, rendering through
// image.js's getDreamPanelImage), consumption (Phase 7 - shouldDream /
// pickQueuedDream / applyDreamWake / fileDreamToDiary / playQueuedDream,
// with the window itself in actionwindow.js's presentDream), the Dream Diary
// app (Phase 8 - the two-surface gallery in render.phone.js / render.computer
// .js reading world.dreams.diary), and the true/recurring classes (Phase 9 -
// rollDreamKind / compileTrueDream / compileRecurringDream, with the writer's
// replay block in llm.js's buildDreamReplayBlock).

// --- The persisted subtree (Phase 1) ---
// world.dreams. Additive default ({} -> this), so no migration is required -
// the same precedent as world.relationships / world.signals. Registered in
// state.js's SAVE_KEYS **and** read back in loadGameState's world literal:
// one without the other writes fine all session and reads back empty forever
// (the castWeb scar, design invariant 7).
function defaultDreamState() {
  return {
    // Compiled + written + rendered, awaiting a sleep. Cap 2 (D19): the queue
    // is topped up opportunistically in the background and consumed by sleep.
    queue: [],
    // Shown dreams, newest first, for the Dream Diary app (Phase 8). Cap 40.
    // A record persists {prompt, seed} per panel and NEVER a blob - the image
    // cache is a shared evictable LRU, so a diary entry has to be able to
    // reconstitute its own pixels on demand indefinitely (D14, the takePhoto
    // discipline).
    diary: [],
    // { motifId, text, dreamId, day }, cap 12. The concrete anchor each dream
    // used - a payphone, a flooded stairwell, a door in the wrong wall - so
    // later dreams can reuse one and the set reads as one dreamer's rather
    // than a series of unrelated one-offs (D10).
    motifHistory: [],
    // Source ids already spent by a 'true' dream, cap 100, so the same
    // off-screen event is never dreamt twice (D9). seenByPlayer is
    // deliberately NOT flipped - that would be a state write (D2).
    consumedEventIds: [],
    // Day of the last shown dream; gates the frequency roll.
    lastDreamDay: null,
    // Monotonic. Feeds the per-dream seed (D5) - never reused, never reset,
    // so two dreams compiled from identical state still differ.
    nextIndex: 1,
  };
}

// Defensive normalization for a hand-edited or partially-written save, in the
// shape normalizeAfterHoursState uses (state.js): preserve the container
// types and let the readers re-derive anything inside them. A malformed
// subtree must degrade to "no dreams yet", never to a throw on the sleep path.
function normalizeDreamState(raw) {
  if (!raw || typeof raw !== 'object') return defaultDreamState();
  const asArr = (v) => Array.isArray(v) ? v : [];
  const idx = Number(raw.nextIndex);
  return {
    queue: asArr(raw.queue),
    diary: asArr(raw.diary),
    motifHistory: asArr(raw.motifHistory),
    consumedEventIds: asArr(raw.consumedEventIds),
    lastDreamDay: Number.isFinite(raw.lastDreamDay) ? raw.lastDreamDay : null,
    nextIndex: Number.isFinite(idx) && idx >= 1 ? Math.floor(idx) : 1,
  };
}

// --- Phase 3: the residue harvester -------------------------------------
// harvestResidue(gs, opts) turns a save into a scored pool of dreamable
// fragments. It is PURE: no RNG, no I/O, no model, no writes. Harvesting the
// same save twice returns the identical array, and the save is unchanged
// afterwards. Phase 4's compiler picks residuePickMin..residuePickMax out of
// this pool and casts the dream from the npcIds it names.
//
// **This function is where D7's omniscience actually lives.** It reads things
// the player has no way to know: NPC-to-NPC chatter from a room they were not
// in, world events still flagged seenByPlayer:false, the emotional tag an NPC
// filed a memory under. That is deliberate, and it is only safe because of
// design invariant 2 - nothing here writes. A dream turns one of these into a
// suspicion; it never turns it into a fact, never flips seenByPlayer, never
// touches an axis. If a future edit to this section needs to write something,
// the edit is wrong.
//
// **Redaction happens HERE, not in the prompt.** Every scorer emits a clause
// that is already dreamable - no ids, no numbers, no mechanics, no raw act
// names - so Phase 5's prompt builder never has to reason about what is safe
// to say. That is why the clause templates below live in this file beside the
// state they are phrasing, while every NUMBER they use lives in
// DREAM_TUNING.residue (defs.dreams.js). Tuning a dream stays a data edit;
// rephrasing one is a code edit, because a phrase is not a dial.
//
// DETERMINISM NOTE: every object is iterated through Object.keys(...).sort()
// and the finished pool is sorted by (weight desc, kind asc, text asc), which
// is a TOTAL order because the pool is deduped on kind+text first. Nothing
// here depends on property insertion order, so a harvest before a save and a
// harvest after a reload agree.

// The ledger's act vocabulary, redacted. codexActLabel() (codex.js) is the
// codex UI's phrasing - "slept together", "masturbating" - which is right for
// a knowledge screen and wrong for a dream: a dream does not report, it
// stages. These are the same acts turned into staged images. Placeholders are
// {name}, {other} and {room}.
const RESIDUE_ACT_CLAUSES = {
  sex: 'a night with {name} that {room} still seems to be holding on to',
  quickie: 'something quick with {name} in {room}, the door not quite shut',
  cuddle: 'lying against {name} in {room} for longer than either of you admitted to',
  shared_shower: 'sharing the water with {name}, the room gone white and close',
  saw_with_X: '{name} and {other} together in {room}, neither of them looking up',
  peeked_masturbation: '{name} alone in {room}, not knowing the door was open',
  boundary_sleep_with: "getting into {name}'s bed while they slept, and staying",
  boundary_watch_sleeper: 'standing over {name} while they slept, longer than you meant to',
  throuple: 'three of you in {room}, and nobody keeping count',
  cuck: 'three of you in {room}, and nobody keeping count',
};
const RESIDUE_ACT_FALLBACK = '{name} in {room}, and something between you that you would not write down';

// --- Clause plumbing ----------------------------------------------------

// One concrete clause out of arbitrary state text: whitespace collapsed, the
// terminal full stop dropped (a fragment is not a sentence), and clamped at a
// word boundary. Question and exclamation marks survive - they carry tone.
function residueClause(text, maxChars) {
  let s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  s = s.replace(/\.$/, '');
  const cap = Number.isFinite(maxChars) ? maxChars : DREAM_TUNING.residue.clauseMaxChars;
  if (s.length <= cap) return s;
  const cut = s.slice(0, cap);
  const sp = cut.lastIndexOf(' ');
  return (sp > cap * 0.5 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, '') + '…';
}

// First names only. A dream does not use surnames, and 'someone' is a better
// failure mode than an npcId leaking into a prompt.
function residueName(npcs, npcId) {
  return (npcId && npcs[npcId]?.bible?.name) || 'someone';
}

// roomPhrase (config.js) already solves the article problem ("the kitchen",
// "your bedroom", "bedroom 2"); this only lowercases it for mid-clause use
// and answers the null case in dream vocabulary rather than with 'null'.
function residueRoomPhrase(roomId) {
  if (!roomId || typeof roomPhrase !== 'function') return 'a room you cannot place';
  return String(roomPhrase(roomId)).toLowerCase();
}

function residueFill(tpl, vars) {
  return String(tpl).replace(/\{(name|other|room)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

// Age decay. Yesterday still shouts, the far edge of the window murmurs.
// A fragment with no date skips the term entirely - a possession or a
// standing grievance is not "infinitely old", it is undated, and treating
// those as the same thing would bury every dateless source forever.
function residueRecency(ctx, fragDay) {
  if (!Number.isFinite(fragDay)) return 1;
  const age = Math.max(0, ctx.day - fragDay);
  return Math.pow(0.5, age / Math.max(0.5, ctx.R.recencyHalfLifeDays));
}

function residueBase(kind) {
  return DREAM_TUNING.residue.kindWeights[kind] || 0.1;
}

// The one fragment constructor, so every fragment in the pool has its keys in
// the same order and a JSON round trip of the pool is stable.
//
// WHAT `day` MEANS, because it is not what it looks like. Most fragments are
// EVENTS and their day is when the thing happened, so it is inside the
// residueDays window by construction. Four are STANDING STATE — a grievance,
// a desire, a tension, an absence — and those are not windowed at all,
// because a two-week-old grievance is still a live grievance and dropping it
// would make the dream mind more forgetful than the NPC holding it. Where
// such a fragment carries a day it is an ORIGIN date (when the grievance was
// formed, when the two of you last spoke), which can be arbitrarily far
// outside the window. So: `day` is provenance, never a promise of recency.
// Anything downstream that wants "recent" must filter on kind, not on day.
function makeResidueFragment(kind, weight, text, extra) {
  const f = { kind, weight: clamp01(weight), text };
  const x = extra || {};
  if (x.npcId) f.npcId = x.npcId;
  if (x.itemId) f.itemId = x.itemId;
  if (x.roomId) f.roomId = x.roomId;
  if (Number.isFinite(x.day)) f.day = x.day;
  // sourceKey is carried ONLY by unseen_event fragments. world.events records
  // have no id of their own, and D9's consumedEventIds ring plus Phase 4's
  // `source.eventIds` both need one; this is the only place in the engine
  // that reads world.events, so it is the only place that can mint it.
  if (x.sourceKey) f.sourceKey = x.sourceKey;
  return f;
}

// weight desc, then kind, then text. Total, because the pool is deduped on
// kind+text before it is sorted.
function residueRank(a, b) {
  if (b.weight !== a.weight) return b.weight - a.weight;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return a.text < b.text ? -1 : (a.text > b.text ? 1 : 0);
}

// Every scorer ends with this: rank its own output and keep the loudest few.
// Without the cap the debug log alone (4000 entries, hundreds of them inside
// a three-day window) would be the entire pool and every dream would be about
// somebody else's small talk.
function residueTop(list, ctx) {
  return list.sort(residueRank).slice(0, ctx.R.perSourceCap);
}

function residueInWindow(ctx, day) {
  return Number.isFinite(day) && day >= ctx.since && day <= ctx.day;
}

// --- The scorers. One per source, each independently testable. -----------

// 1. player.ledger - what the player did, and what they watched. The loudest
// material in any save, because their body was there for it.
function harvestLedgerResidue(ctx) {
  const ledger = ctx.gs.player?.ledger;
  if (!ledger || typeof ledger !== 'object') return [];
  const out = [];
  for (const npcId of Object.keys(ledger).sort()) {
    const entries = Array.isArray(ledger[npcId]) ? ledger[npcId] : [];
    for (const e of entries) {
      if (!e || !residueInWindow(ctx, e.day)) continue;
      // 'told' is second-hand knowledge - words, not a memory of being there.
      const kind = e.kind === 'witnessed' ? 'witnessed'
        : e.kind === 'told' ? 'overheard'
        : 'participated';
      const text = residueFill(RESIDUE_ACT_CLAUSES[e.act] || RESIDUE_ACT_FALLBACK, {
        name: residueName(ctx.npcs, npcId),
        other: residueName(ctx.npcs, e.otherNpcId),
        room: residueRoomPhrase(e.roomId),
      });
      // Being caught is the loudest version of any act - it is the one the
      // player replays.
      const strength = e.outcome === 'caught' ? 1 : 0.85;
      out.push(makeResidueFragment(kind, residueBase(kind) * strength * residueRecency(ctx, e.day), text, {
        npcId, roomId: e.roomId, day: e.day,
      }));
    }
  }
  return residueTop(out, ctx);
}

// 2. The troubleshooting log - talk. Two categories only: 'conversation'
// (lines the player was present for) and 'conversation_ambient' (NPC-to-NPC
// chat in a room they were not in, D7 material and weighted above the rest).
// 'prompt' is excluded by naming the categories rather than by filtering it
// out afterwards, because a single captured prompt is several KB of model
// instructions and would be the worst thing in this pool.
function harvestChatterResidue(ctx) {
  if (typeof queryDebugLog !== 'function') return [];
  // queryDebugLog trusts world.debugLog to be an array (it is, everywhere the
  // sim writes it). A hand-edited or half-migrated save is the one caller it
  // has never had, and this path must degrade to "no dream material" rather
  // than throw on the background pre-generation pass.
  if (!Array.isArray(ctx.gs.world?.debugLog)) return [];
  const entries = queryDebugLog(ctx.gs, {
    dayFrom: ctx.since, dayTo: ctx.day,
    categories: ['conversation_ambient', 'conversation'],
  });
  const out = [];
  for (const e of entries) {
    if (!e || !e.detail) continue;
    const d = e.detail;
    let text = '';
    let strength = 0;
    let npcId = null;
    if (e.category === 'conversation_ambient') {
      const said = residueClause(typeof formatEventText === 'function' ? formatEventText(d, ctx.npcs) : d.template);
      if (!said) continue;
      text = said + ', with a door between you and it';
      strength = 0.9;
      npcId = d.npcId || (Array.isArray(e.npcIds) ? e.npcIds[0] : null);
    } else {
      const line = residueClause(d.text);
      if (!line) continue;
      if (d.speaker === 'player') {
        text = 'a thing you said out loud and could not take back: "' + line + '"';
        strength = 0.55;
      } else {
        text = residueName(ctx.npcs, d.speaker) + ', saying it again: "' + line + '"';
        strength = 0.7;
        npcId = d.speaker;
      }
    }
    out.push(makeResidueFragment('overheard', residueBase('overheard') * strength * residueRecency(ctx, e.day), text, {
      npcId, day: e.day,
    }));
  }
  return residueTop(out, ctx);
}

// 3. Unseen world events - the superpower proper (D7). Anything still flagged
// seenByPlayer:false happened while the player was elsewhere. seenByPlayer is
// READ here and never written: flipping it would be a state write (D2) and
// would also silently eat the "While you were asleep: ..." batch.
//
// Events carry no id, so a stable key is minted from the fields that identify
// one. Already-consumed keys (D9's ring) are skipped, so the same off-screen
// event is never dreamt twice.
function dreamEventKey(evt) {
  return 'evt:' + hashStr([evt.day, evt.tick, evt.npcId, evt.type, evt.roomId, evt.template].join('|'));
}

// Episodes have no id of their own (the NPC memory model mints none), so the
// same stable-key discipline is applied to the fields that identify one. The
// key is what lets a shown true dream spend an episode in the D9 ring exactly
// like a world event, so the same night from the same side is never dreamt
// twice.
function dreamEpisodeKey(npcId, ep) {
  return 'epi:' + hashStr([npcId, ep.day, ep.text].join('|'));
}

function harvestUnseenEventResidue(ctx) {
  const events = Array.isArray(ctx.gs.world?.events) ? ctx.gs.world.events : [];
  const consumedRaw = ctx.gs.world?.dreams?.consumedEventIds;
  const consumed = new Set(Array.isArray(consumedRaw) ? consumedRaw : []);
  const out = [];
  for (const e of events) {
    if (!e || e.seenByPlayer) continue;
    if (!residueInWindow(ctx, e.day)) continue;
    const key = dreamEventKey(e);
    if (consumed.has(key)) continue;
    const said = residueClause(typeof formatEventText === 'function' ? formatEventText(e, ctx.npcs) : e.template);
    if (!said) continue;
    out.push(makeResidueFragment('unseen_event',
      residueBase('unseen_event') * residueRecency(ctx, e.day),
      said + ' — and nobody mentioned it to you',
      { npcId: e.npcId, roomId: e.roomId, day: e.day, sourceKey: key }));
  }
  return residueTop(out, ctx);
}

// 4. NPC episodes - the same night from the other side of it. An episode is
// how an NPC filed something in their own memory, which the player has no
// route to, so all of these are unseen_event regardless of whether the player
// was standing there: what is unseen is the SIDE, not the event.
//
// Filtered by emotionalTag exactly as the plan specifies - an untagged
// episode is domestic filler - and by the same decay > 0.2 floor
// retrieveRelevantMemories (npc.js) uses to decide a memory is still live.
// Day-0 episodes are seeded shared history rather than residue; the window
// keeps them out, which is intended - they would otherwise be in every dream
// forever.
function harvestEpisodeResidue(ctx) {
  const out = [];
  for (const npcId of Object.keys(ctx.npcs).sort()) {
    const eps = ctx.npcs[npcId]?.memory?.episodes;
    if (!Array.isArray(eps)) continue;
    const name = residueName(ctx.npcs, npcId);
    for (const ep of eps) {
      if (!ep || !ep.text || !residueInWindow(ctx, ep.day)) continue;
      const decay = Number.isFinite(ep.decay) ? ep.decay : 1;
      if (decay <= ctx.R.episodeDecayFloor) continue;
      const tag = String(ep.emotionalTag || '');
      const emo = EMOTIONAL_WEIGHTS[tag];
      if (!tag || !Number.isFinite(emo)) continue;
      const importance = Number.isFinite(ep.importance) ? ep.importance : MEMORY_IMPORTANCE.conversational;
      const clause = residueClause(ep.text);
      if (!clause) continue;
      out.push(makeResidueFragment('unseen_event',
        residueBase('unseen_event') * emo * importance * decay * residueRecency(ctx, ep.day),
        'how it looked from ' + name + "'s side: " + clause,
        { npcId, day: ep.day }));
    }
  }
  return residueTop(out, ctx);
}

// 5. relPlayer extremes - the standing weather between the player and each
// resident. Three reads, all of them undated except the grievances: a
// grievance keeps its day, a desire or a tension is a state and not an event.
function harvestRelationshipResidue(ctx) {
  const R = ctx.R;
  const out = [];
  for (const npcId of Object.keys(ctx.npcs).sort()) {
    const rel = ctx.npcs[npcId]?.relPlayer;
    if (!rel) continue;
    const name = residueName(ctx.npcs, npcId);

    for (const g of (Array.isArray(rel.grievances) ? rel.grievances : [])) {
      if (!g || g.resolved) continue;
      const clause = residueClause(g.text);
      if (!clause) continue;
      const severity = Number.isFinite(g.severity) ? g.severity : 0.3;
      out.push(makeResidueFragment('grievance',
        residueBase('grievance') * clamp01(0.4 + severity * 0.6) * residueRecency(ctx, g.day),
        name + ' has not put it down: ' + clause,
        { npcId, day: Number.isFinite(g.day) ? g.day : undefined }));
    }

    const desire = Number.isFinite(rel.desire) ? rel.desire : 0;
    if (Math.abs(desire) >= R.desireThreshold) {
      const text = desire > 0
        ? name + ' looking a beat too long, and knowing they did'
        : name + ' finding a reason to be on the other side of the room';
      out.push(makeResidueFragment('appetite',
        residueBase('appetite') * clamp01(Math.abs(desire)), text, { npcId }));
    }

    const tension = Number.isFinite(rel.tension) ? rel.tension : 0;
    if (tension >= R.tensionThreshold) {
      out.push(makeResidueFragment('grievance',
        residueBase('grievance') * clamp01(tension) * 0.8,
        'something unsaid between you and ' + name + ', going quietly bad',
        { npcId }));
    }
  }
  return residueTop(out, ctx);
}

// 6. The late-night search box (world.afterHours.searchHistory). Nothing else
// in the game reads what the player typed into it, which is exactly why it is
// good residue: it is the one record of a want nobody was performing for.
function harvestSearchResidue(ctx) {
  const hist = ctx.gs.world?.afterHours?.searchHistory;
  if (!Array.isArray(hist)) return [];
  const out = [];
  for (const s of hist) {
    if (!s || !residueInWindow(ctx, s.day)) continue;
    const q = residueClause(s.query, 60);
    if (!q) continue;
    out.push(makeResidueFragment('appetite',
      residueBase('appetite') * residueRecency(ctx, s.day),
      'something you typed late and cleared afterwards: "' + q + '"',
      { day: s.day }));
  }
  return residueTop(out, ctx);
}

// 7. Obligations - the two kinds of date the game holds over the player: a
// quest about to expire and a bill about to be, or already, late. Rent is not
// special-cased; overdueDays does the work, and rent is simply the bill that
// gets there first and hardest.
function harvestObligationResidue(ctx) {
  const R = ctx.R;
  const out = [];

  const quests = ctx.gs.world?.quests?.active;
  for (const q of (Array.isArray(quests) ? quests : [])) {
    if (!q || q.status === 'completed' || q.status === 'failed') continue;
    if (!Number.isFinite(q.expiresDay)) continue;
    const left = q.expiresDay - ctx.day;
    if (left < 0 || left > R.questExpiryDays) continue;
    const clause = residueClause(q.title);
    if (!clause) continue;
    // Tighter deadline, louder fragment: due today is 1, the far edge of the
    // window is 1/(questExpiryDays+1).
    out.push(makeResidueFragment('obligation',
      residueBase('obligation') * (1 / (left + 1)),
      'a thing you said you would do and have not: ' + clause,
      { npcId: q.npcId, day: q.expiresDay }));
  }

  const bills = ctx.gs.world?.bills;
  if (bills && typeof bills === 'object') {
    for (const id of Object.keys(bills).sort()) {
      const b = bills[id];
      if (!b || !(Number(b.balance) > 0)) continue;
      const overdue = Number.isFinite(b.overdueDays) ? b.overdueDays : 0;
      const untilDue = Number.isFinite(b.dueDay) ? b.dueDay - ctx.day : Infinity;
      if (overdue <= 0 && !(untilDue <= R.billDueDays)) continue;
      const label = String(BILL_DEFS[id]?.label || id).toLowerCase();
      const strength = overdue > 0
        ? clamp01(0.6 + 0.4 * Math.min(1, overdue / R.billOverdueFull))
        : 0.45;
      const text = overdue > 0
        ? 'the ' + label + ', unpaid long enough that the number has started to mean something'
        : 'the ' + label + ', with a date on it that is nearly here';
      out.push(makeResidueFragment('obligation',
        residueBase('obligation') * strength, text,
        { itemId: id, day: Number.isFinite(b.dueDay) ? b.dueDay : undefined }));
    }
  }
  return residueTop(out, ctx);
}

// 8. Possessions. The quietest source and the most reliable - an object the
// player handles every day is furniture in the waking flat and an omen in a
// dream. Sorted singular-first (a stack of six eggs is inventory; one book is
// an image), then by defId so the tie is not left to insertion order.
function harvestPossessionResidue(ctx) {
  const inv = ctx.gs.player?.inventory;
  if (!Array.isArray(inv)) return [];
  const stacks = inv.filter(s => s && s.defId && s.defId !== '_unknown');
  stacks.sort((a, b) => {
    const qa = Number(a.qty) || 1, qb = Number(b.qty) || 1;
    if (qa !== qb) return qa - qb;
    return a.defId < b.defId ? -1 : (a.defId > b.defId ? 1 : 0);
  });
  const out = [];
  for (const s of stacks) {
    const label = String(typeof stackLabel === 'function' ? stackLabel(s) : s.defId).toLowerCase();
    if (!label) continue;
    out.push(makeResidueFragment('possession', residueBase('possession'),
      'the ' + label + ' you have been carrying around', { itemId: s.defId }));
  }
  return residueTop(out, ctx);
}

// 9. Absence. Somebody who lives here and has not been spoken to. Scales from
// nothing at absenceDays to full weight at absenceDaysFull, so a quiet week
// registers and a quiet fortnight does not keep getting louder forever.
function harvestAbsenceResidue(ctx) {
  const R = ctx.R;
  const out = [];
  for (const npcId of Object.keys(ctx.npcs).sort()) {
    const rel = ctx.npcs[npcId]?.relPlayer;
    if (!rel) continue;
    if (!Number.isFinite(rel.lastInteractionDay)) continue;
    const gap = ctx.day - rel.lastInteractionDay;
    if (gap < R.absenceDays) continue;
    const span = Math.max(1, R.absenceDaysFull - R.absenceDays);
    const strength = clamp01((gap - R.absenceDays) / span) * 0.7 + 0.3;
    out.push(makeResidueFragment('absence', residueBase('absence') * strength,
      residueName(ctx.npcs, npcId) + ', who you have not spoken to in days, in the room anyway',
      { npcId, day: rel.lastInteractionDay }));
  }
  return residueTop(out, ctx);
}

// Order here is documentation only - the pool is sorted by weight at the end,
// and the dedupe is on kind+text, so an earlier scorer wins a tie only when a
// later one produced a byte-identical fragment.
const DREAM_RESIDUE_SCORERS = [
  harvestLedgerResidue,
  harvestChatterResidue,
  harvestUnseenEventResidue,
  harvestEpisodeResidue,
  harvestRelationshipResidue,
  harvestSearchResidue,
  harvestObligationResidue,
  harvestPossessionResidue,
  harvestAbsenceResidue,
];

// The harvester. PURE - same save in, same array out, save untouched.
// opts: { day, residueDays, limit } - all three are overrides for the harness
// and for Phase 4's queue top-up, which compiles ahead of the night it is
// for. An empty or malformed save returns [] rather than throwing: this runs
// on the background pre-generation path, where a throw would present as a
// silently dreamless playthrough and nothing else.
function harvestResidue(gs, opts = {}) {
  if (!gs || typeof gs !== 'object') return [];
  const R = DREAM_TUNING.residue;
  const rawDay = Number.isFinite(opts.day) ? opts.day : Number(gs.meta?.clock?.day);
  const windowDays = Number.isFinite(opts.residueDays) ? opts.residueDays : DREAM_TUNING.residueDays;
  const ctx = {
    gs,
    npcs: (gs.npcs && typeof gs.npcs === 'object') ? gs.npcs : {},
    day: Number.isFinite(rawDay) ? rawDay : 1,
    R,
  };
  ctx.since = ctx.day - windowDays;

  const seen = new Set();
  const pool = [];
  for (const scorer of DREAM_RESIDUE_SCORERS) {
    for (const f of scorer(ctx)) {
      if (!f || !f.text) continue;
      const key = f.kind + '|' + f.text;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(f);
    }
  }
  pool.sort(residueRank);
  const limit = Number.isFinite(opts.limit) ? opts.limit : R.poolCap;
  return limit > 0 ? pool.slice(0, limit) : pool;
}

// Motifs harvested from real owned items, in DREAM_MOTIFS' own entry shape
// (see that table's comment: "built at harvest time in this same shape and
// never written back here"). Phase 4 concatenates these onto
// Object.values(DREAM_MOTIFS) before its weighted draw, so a player's actual
// possessions can become the recurring anchor of their dreams alongside the
// authored payphone and flooded stair.
//
// The id is namespaced 'item:<defId>' so a motif recorded into
// world.dreams.motifHistory stays recognisable later even if the player no
// longer owns the thing - motifHistory persists the text, and a carried motif
// must not depend on the item still being in the bag.
function harvestItemMotifs(gs) {
  const inv = gs?.player?.inventory;
  if (!Array.isArray(inv)) return [];
  const seen = new Set();
  const out = [];
  for (const s of inv) {
    if (!s || !s.defId || s.defId === '_unknown' || seen.has(s.defId)) continue;
    seen.add(s.defId);
    const label = String(typeof stackLabel === 'function' ? stackLabel(s) : s.defId).toLowerCase();
    if (!label) continue;
    out.push({
      id: 'item:' + s.defId,
      label: 'The ' + label,
      weight: DREAM_TUNING.residue.itemMotifWeight,
      // No pronoun, deliberately: an item label can be plural ('keys',
      // 'eggs') and any 'it'/'them' here would be wrong half the time.
      text: 'the ' + label + ', in the same place as always',
      directive: 'It belongs to the dreamer and the dream treats it as unremarkable. Do not explain why it is there.',
      imageFragment: label + ', alone on a flat surface',
      itemId: s.defId,
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)));
  return out.slice(0, DREAM_TUNING.residue.itemMotifCap);
}

// --- Phase 4: the compiler ----------------------------------------------
// compileDream(gs, { forSleep, index }) turns a save plus an index into a
// COMPLETE dream record: every slot filled from the authored tables, the cast
// chosen, the motif chosen, and every panel's image prompt composed and
// frozen. No LLM call (Phase 5 writes the prose into panels[].text) and no
// image generation (Phase 6 renders panels[].prompt at the cache boundary).
//
// This function is where D1 actually lives. Form, perspective, tempo,
// register, lens, distortion, setting, cast, motif and panel count are all
// decided HERE, by a seeded roll over defs.dreams.js, before the model has
// been shown anything. Everything downstream receives a finished skeleton.
// If a later edit lets the writer choose any of the above, the anti-slop
// guarantee is gone and this is just another text generator.
//
// THREE THINGS THAT MUST STAY TRUE:
//
//  1. **Its own RNG stream** (D5, design invariant 5). Every draw below comes
//     from the local `rng` built from seededRng(gs.meta.seed,
//     hashStr('dream|' + index)). Not one draw touches the global cast
//     stream; a single Math.random or shared-stream draw here would shift
//     every existing seed's house.
//  2. **It writes nothing** (D2, design invariant 2). It reads the residue,
//     the NPCs, the inventory, the motif history and the settings, and
//     returns a fresh object. The caller owns world.dreams.
//  3. **Byte-identical for the same seed and state.** Same save + same index
//     in, deep-equal record out, every time and across a save/load round
//     trip. That is what makes the queue safe to compile in the background,
//     and what Phase 9's recurrence will rely on.
//
// A NOTE ON DRAW COUNTS, because it is the subtle part. Several selections
// below take an rng() draw UNCONDITIONALLY and only then decide whether the
// branch it feeds is even reachable (the motif carry roll is the clearest
// case). That is deliberate: it keeps the number of draws a function of the
// STATE rather than of which branch happened to be live, so adding material
// to a save does not silently re-cast everything after it in the sequence.

// The clauses the panel prompt needs that are not on any table, kept here for
// D27's reason: a phrase is not a dial, so phrasing lives beside the code
// that composes it while every NUMBER lives in DREAM_TUNING.
const DREAM_ABSENT_PHRASE = 'a conspicuously empty space where a person should be standing';
const DREAM_EMPTY_CAST_PHRASE = 'no people anywhere in frame, an unoccupied space';
// Deliberately NOT carrying an orientation clause, unlike every other prompt
// composer in image.js. A panel prompt is FROZEN onto the record and read
// again by the Dream Diary weeks later (D14); the viewport it is eventually
// drawn at is a fact about the device, not about the dream. Phase 6 appends
// the orientation clause and applyImageStyle at the cache boundary, which is
// where every other surface applies both.
const DREAM_PROMPT_TAIL = 'dream imagery, anime-inspired slice-of-life illustration, cinematic composition';

// --- Selection plumbing -------------------------------------------------

// Live settings, with the defaults as the floor. Read through `typeof` rather
// than assumed, so a harness that loads dreams.js without settings.js gets
// the documented defaults instead of a ReferenceError on the sleep path.
function dreamOptionId(field) {
  const live = (typeof settingsCache === 'object' && settingsCache) ? settingsCache[field] : null;
  if (live) return live;
  return (typeof SETTINGS_DEFAULTS === 'object' && SETTINGS_DEFAULTS) ? SETTINGS_DEFAULTS[field] : 'balanced';
}

function dreamSfwOn() {
  return typeof isSfwMode === 'function' ? isSfwMode() === true : false;
}

// A table as a selection pool: id-sorted, so the pool a seed draws from does
// not depend on the order entries happen to be authored in. (Insertion order
// is stable in the source file today; sorting means it stays irrelevant if
// somebody reorders a table for readability, which is exactly the kind of
// edit nobody expects to change gameplay.)
function dreamPool(table, filterFn) {
  const out = [];
  for (const id of Object.keys(table).sort()) {
    const entry = table[id];
    if (!entry) continue;
    if (filterFn && !filterFn(entry)) continue;
    out.push(entry);
  }
  return out;
}

// One weighted draw, with an optional tuning multiplier folded onto the
// entry's own authored weight. The 0.0001 floor is the weightedPick trap
// documented at the top of defs.dreams.js: a computed weight of exactly 0
// would be read back as 1 and turn "almost never" into "as likely as
// anything else". Exclusion is always a filter, never a zero.
function dreamPick(rng, pool, multFn) {
  return weightedPick(rng, pool, (entry) => Math.max(0.0001, (entry.weight || 1) * (multFn ? multFn(entry) : 1)));
}

// dreamAbstraction -> per-band multiplier. Reaches forms, lenses, distortions
// and settings alike through their `abstraction` tag, which is the whole
// reason that tag is on the entry rather than in a per-id map (D17).
function dreamAbstractionMult(entry) {
  const table = DREAM_TUNING.abstractionWeights;
  const map = table[dreamOptionId('dreamAbstraction')] || table.balanced;
  const m = map[entry.abstraction];
  return Number.isFinite(m) ? m : 1;
}

// dreamRegister -> per-register multiplier over the register's own weight.
function dreamRegisterMult(entry) {
  const table = DREAM_TUNING.registerWeights;
  const map = table[dreamOptionId('dreamRegister')] || table.balanced;
  const m = map[entry.id];
  return Number.isFinite(m) ? m : 1;
}

// The sfw gate (D17): a HARD filter that removes the entry from the pool
// outright, independent of dreamRegister and of every multiplier above it.
// Not a weight (see the weightedPick trap) and not a prompt softener - a
// softened erotic dream is still an erotic dream.
function dreamRegisterAllowed(entry) {
  return !(entry.sfwGated && dreamSfwOn());
}

// --- The rolls ----------------------------------------------------------

// D8 names three dream classes. Both draws are taken HERE AND NOW, in a fixed
// order, so the class decision never shifts which numbers a 'distorted' dream
// consumes no matter which branch ends up running (design invariant 5).
// 'true' wins the first draw, so a save whose unseen material has all been
// spent still gets its regular share of recurrence; a 'true' or 'recurring'
// roll that finds no source falls through to 'distorted' with the stream
// exactly where a 'distorted' roll would have left it, so the fallback dream
// is byte-identical to a direct 'distorted' cast.
function rollDreamKind(rng) {
  const a = rng();
  const b = rng();
  if (a < DREAM_TUNING.trueDreamChance) return 'true';
  if (b < DREAM_TUNING.recurrenceChance) return 'recurring';
  return 'distorted';
}

// An apartment setting's actual room, weighted by how loudly the residue
// points at it: the room the grievance happened in, the room they were
// watched in. ROOMS is read live rather than restated in defs.dreams.js -
// enumerating the seventeen rooms in a second file is the two-homes mistake
// design invariant 7 is about.
//
// The fallback room is always folded in as an extra candidate rather than
// used only when the residue names nothing, so the draw count does not depend
// on whether this particular save happened to produce a room.
function selectDreamRoom(rng, gs, pool) {
  const weights = new Map();
  for (const f of pool) {
    if (!f.roomId || !ROOMS[f.roomId]) continue;
    weights.set(f.roomId, (weights.get(f.roomId) || 0) + f.weight);
  }
  const here = (gs?.player?.location && ROOMS[gs.player.location]) ? gs.player.location : 'bedroom_player';
  weights.set(here, (weights.get(here) || 0) + DREAM_TUNING.roomFallbackWeight);
  const cands = [...weights.keys()].sort().map((id) => ({ id, weight: weights.get(id) }));
  return dreamPick(rng, cands, null).id;
}

// slots.setting = { settingId, sourceKind, roomId }. `settingId` is beyond
// the two fields the plan's data model listed, and is additive for the same
// reason D26's sourceKey was: without it Phase 5 cannot find the setting's
// directive and Phase 9 cannot reproduce a recurring dream's place, and no
// other field could carry it without being a type pun.
//
// A form may LOCK the setting kind (`settingKind` on the form entry). Exactly
// one does today: wrong_room's whole directive is "the dreamer's own
// apartment with one thing added", which a night bus cannot satisfy.
function selectDreamSetting(rng, gs, form, pool) {
  const kind = form.settingKind || null;
  const entry = dreamPick(rng, dreamPool(DREAM_SETTINGS, (e) => !kind || e.sourceKind === kind), dreamAbstractionMult);
  const roomId = entry.sourceKind === 'apartment' ? selectDreamRoom(rng, gs, pool) : null;
  return { settingId: entry.id, sourceKind: entry.sourceKind, roomId };
}

// 0-2 named NPCs, drawn from the npcIds the residue actually names and
// weighted by how much of the pool is about each of them (D8's cast comes
// from the material, never from the roster).
//
// D22 in miniature: somebody who has already moved out is filtered here
// rather than caught later by dreamStillValid, because a dream that is
// invalid the moment it is compiled should never enter the queue at all.
// `residency.status === 'former'` is the same test world.js uses for room
// ownership.
//
// ROLES. A cast member whose loudest fragment is an `absence` is 'absent' -
// the dream is about them not being there, and the panel prompt shows the
// space they are missing from rather than them. Everyone else is 'figure'
// first and 'witness' after. There is deliberately no rule promoting an
// all-absent cast back to a figure: a dream in an empty room about two people
// who are not in it is a real dream and the engine should be able to make one.
function selectDreamCast(rng, gs, pool) {
  const npcs = (gs && gs.npcs && typeof gs.npcs === 'object') ? gs.npcs : {};
  const byNpc = new Map();
  for (const f of pool) {
    if (!f.npcId) continue;
    const npc = npcs[f.npcId];
    if (!npc || npc.residency?.status === 'former') continue;
    const cur = byNpc.get(f.npcId) || { npcId: f.npcId, weight: 0, loudest: null };
    cur.weight += f.weight;
    if (!cur.loudest || residueRank(f, cur.loudest) < 0) cur.loudest = f;
    byNpc.set(f.npcId, cur);
  }
  const cands = [...byNpc.values()].sort((a, b) => (a.npcId < b.npcId ? -1 : (a.npcId > b.npcId ? 1 : 0)));
  if (cands.length === 0) return [];
  const wantTwo = rng() < DREAM_TUNING.castTwoChance;
  const size = Math.min(DREAM_TUNING.castMax, cands.length, (wantTwo && cands.length >= 2) ? 2 : 1);
  return pickUnique(rng, cands, size, (c) => Math.max(0.0001, c.weight)).map((c, i) => ({
    npcId: c.npcId,
    role: (c.loudest && c.loudest.kind === 'absence') ? 'absent' : (i === 0 ? 'figure' : 'witness'),
  }));
}

// D10's carryover, or a fresh anchor. The carry roll is taken before the
// history is consulted so the draw count is the same either way.
//
// The fresh pool is the authored table PLUS the player's own possessions
// (harvestItemMotifs, Phase 3), which arrive already in the authored entry
// shape and so need no special case here - that was the point of building
// them that way.
function selectDreamMotif(rng, gs) {
  const history = Array.isArray(gs?.world?.dreams?.motifHistory) ? gs.world.dreams.motifHistory : [];
  const usable = history.filter((h) => h && h.motifId && h.text);
  const carryRoll = rng();
  if (usable.length > 0 && carryRoll < DREAM_TUNING.motifCarryChance) {
    const sorted = usable
      .map((h) => ({ motifId: h.motifId, text: h.text, dreamId: h.dreamId || null, weight: 1 }))
      .sort((a, b) => {
        if (a.motifId !== b.motifId) return a.motifId < b.motifId ? -1 : 1;
        return String(a.dreamId) < String(b.dreamId) ? -1 : (String(a.dreamId) > String(b.dreamId) ? 1 : 0);
      });
    const carried = dreamPick(rng, sorted, null);
    return { motifId: carried.motifId, text: carried.text, carriedFrom: carried.dreamId };
  }
  const fresh = Object.values(DREAM_MOTIFS)
    .concat(harvestItemMotifs(gs))
    .sort((a, b) => (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)));
  const picked = dreamPick(rng, fresh, null);
  return { motifId: picked.id, text: picked.text, carriedFrom: null };
}

// The motif's visual, resolved rather than stored. The record keeps only
// { motifId, text, carriedFrom } because that is the documented shape and
// because an imageFragment copied onto it would be authored data living in
// two places. Three sources in order: the authored table, the player's
// current possessions, and - for a carried motif whose item has since been
// sold, eaten or lost - the record's own text, which was written to read as
// exactly this.
function dreamMotifImageFragment(gs, motif) {
  if (!motif || !motif.motifId) return '';
  const authored = DREAM_MOTIFS[motif.motifId];
  if (authored) return authored.imageFragment;
  const item = harvestItemMotifs(gs).find((m) => m.id === motif.motifId);
  if (item) return item.imageFragment;
  return motif.text || '';
}

// residuePickMin..residuePickMax fragments out of the pool, re-weighted so
// the material is ABOUT the people the dream is casting. Without the cast
// affinity the compiler routinely handed the writer a dream cast with one
// roommate and three fragments naming a different one, which reads as an
// editing mistake rather than as dream logic. Fragments that name nobody -
// a bill, an object, a search - are untouched by both multipliers.
//
// The result is re-sorted into residueRank order so the record is stable and
// the writer sees its loudest material first.
function selectDreamResidue(rng, pool, cast) {
  const want = DREAM_TUNING.residuePickMin
    + Math.floor(rng() * (DREAM_TUNING.residuePickMax - DREAM_TUNING.residuePickMin + 1));
  const n = Math.min(want, pool.length);
  if (n <= 0) return [];
  const castIds = new Set(cast.map((c) => c.npcId));
  return pickUnique(rng, pool, n, (f) => {
    let w = Math.max(0.0001, f.weight);
    if (f.npcId) w *= castIds.has(f.npcId) ? DREAM_TUNING.castAffinityBoost : DREAM_TUNING.castStrangerDamp;
    return w;
  }).sort(residueRank);
}

// --- Panel prompts ------------------------------------------------------

// A room as an image-prompt noun. roomPhrase (config.js) solves the PROSE
// article problem - "your bedroom", "Bedroom 2" - and neither of those
// belongs in a diffusion prompt: a possessive means nothing to the model and
// a designator ("Bedroom 2") is a proper noun it will try to render as text.
// What the prompt wants is the KIND of room, so the possessive and the
// designator are both stripped.
function dreamRoomImageNoun(roomId) {
  const name = ROOMS[roomId]?.name;
  if (!name) return 'in a shared apartment';
  const noun = String(name).replace(/^Your\s+/i, '').replace(/\s+([0-9]+|[A-Z])$/, '').trim().toLowerCase();
  return 'in the ' + (noun || 'apartment') + ' of a shared apartment';
}

function dreamSettingPhrase(setting) {
  const entry = DREAM_SETTINGS[setting?.settingId];
  if (!entry) return '';
  if (entry.sourceKind !== 'apartment') return entry.imageFragment;
  return `${dreamRoomImageNoun(setting.roomId)}, ${entry.imageFragment}`;
}

// PURE, and FROZEN the moment it returns (D14, the takePhoto discipline): the
// record persists this string and its seed, never a blob, so a diary entry
// can reconstitute its own pixels after the shared LRU has evicted them.
// Nothing here may read anything that will have changed by the time the
// player opens the diary.
//
// The order is subject, then what this panel is doing, then where, then how
// it is lit and shot - the same front-to-back ordering every other composer
// in image.js uses, because diffusion models weight early tokens harder.
// Every table's `imageFragment` gets folded in; that is the field's entire
// purpose (D6), and it is why a new lens or distortion needs no code change
// at all to reach the picture.
function composeDreamPanelPrompt(dream, beat, gs) {
  const s = dream.slots;
  const form = DREAM_FORMS[s.form];
  const perspective = DREAM_PERSPECTIVES[s.perspective];
  const tempo = DREAM_TEMPO[s.tempo];
  const register = DREAM_REGISTERS[s.register];
  const lens = DREAM_LENSES[s.lens];
  const distortion = DREAM_DISTORTIONS[s.distortion];

  const subjects = [];
  for (const member of dream.cast) {
    if (member.role === 'absent') { subjects.push(DREAM_ABSENT_PHRASE); continue; }
    const npc = gs?.npcs?.[member.npcId];
    if (!npc) continue;
    subjects.push(buildVisualCharacterClause(npc, { gameState: gs, npcId: member.npcId }));
  }
  // The dreamer is drawn only when the perspective actually shows them.
  // Over-the-shoulder does; a first-person POV, a floating vantage, somebody
  // else's body and a scene watched through glass all do not, and describing
  // a subject the framing says is not there is how you get a figure standing
  // in the middle of their own point-of-view shot.
  if (perspective.dreamerInFrame && gs?.player) {
    subjects.push(buildVisualCharacterClause(gs.player, { gameState: gs, isPlayer: true }));
  }
  if (subjects.length === 0) subjects.push(DREAM_EMPTY_CAST_PHRASE);

  return [
    ...subjects,
    beat.phrase,
    form.imageFragment,
    perspective.imageFragment,
    dreamSettingPhrase(s.setting),
    distortion.imageFragment,
    dreamMotifImageFragment(gs, dream.motif),
    tempo.imageFragment,
    register.imageFragment,
    lens.imageFragment,
    DREAM_PROMPT_TAIL,
  ].filter(Boolean).join(', ');
}

// The panel's cache key, minus the style token Phase 6 appends at the cache
// boundary - exactly the split getPhotoImage uses (`photo_${id}${stylePart}`
// over a frozen, unstyled record prompt). Nothing else needs to fold in:
// unlike an archetype key there is no room, phase or player identity to vary
// over, because the prompt this key names was frozen at compile time and will
// never be recomposed. IMAGE_PROMPT_VERSION rides along so a change to the
// composition above can never serve pixels drawn from the old one.
function composeDreamPanelKey(dream, panelIndex) {
  return `dream_${IMAGE_PROMPT_VERSION}_${dream.id}_p${panelIndex}`;
}

// --- compileDream -------------------------------------------------------

// opts:
//   forSleep - 'night' (default) or 'nap'. Decides which half of DREAM_FORMS
//              is in the pool, and therefore the panel count (D16).
//   index    - world.dreams.nextIndex at compile time. Feeds the seed, so two
//              dreams compiled from identical state still differ. Read from
//              the save when omitted; the CALLER owns incrementing it,
//              because this function writes nothing.
//   day      - harvest the residue as of this day rather than the clock's.
//              The queue top-up compiles ahead of the night it is for.
//   residue  - a pre-harvested pool, for the harness and for a caller that
//              already has one. Skips the harvest, changes nothing else.
//
// Returns the record, or null for a state too broken to compile from. Never
// throws: this runs on the background pre-generation path, where a throw
// presents as a silently dreamless playthrough and nothing else.
function compileDream(gs, opts = {}) {
  if (!gs || typeof gs !== 'object') return null;

  const index = Number.isFinite(opts.index)
    ? Math.floor(opts.index)
    : (Number(gs.world?.dreams?.nextIndex) || 1);
  const forSleep = opts.forSleep === 'nap' ? 'nap' : 'night';
  const baseSeed = (gs.meta && gs.meta.seed != null) ? gs.meta.seed : 'no-seed';

  // D5: the dream's own stream, never the global one.
  const rng = seededRng(baseSeed, hashStr('dream|' + index));
  const seed = hashStr(`${baseSeed}|dream|${index}`);
  const id = 'dream_' + hashStr(`${seed}|${index}`).toString(36);

  const head = { id, seed, index, forSleep, rng };
  const kind = rollDreamKind(rng);

  // Phase 9's branches select their source with NO draws, so a 'true' or
  // 'recurring' roll that finds no material falls through to 'distorted'
  // with the stream exactly where a 'distorted' cast expects it (design
  // invariant 5): the fallback record is byte-identical to a direct
  // 'distorted' roll, and the class roll never shifts anyone's dream.
  if (kind === 'true') {
    const d = compileTrueDream(gs, opts, head);
    if (d) return d;
  } else if (kind === 'recurring') {
    const d = compileRecurringDream(gs, opts, head);
    if (d) return d;
  }
  return compileDistortedDream(gs, opts, head);
}

// --- The shared tail ----------------------------------------------------
// Everything after the class's own selections. `pieces` carries whatever a
// branch decided differently: the six table entries, the setting/cast/motif/
// residue records, the episode keys a true dream spent, the diary id a
// recurring dream re-runs, and which beat of it is the shift.
function finishDreamRecord(gs, head, pieces) {
  const { id, seed, index, forSleep } = head;
  const form = pieces.form;
  const residue = pieces.residue || [];
  const dream = {
    id, seed, index, kind: pieces.kind,
    // When it was COMPILED, which is not necessarily the night it is for -
    // opts.day moves the harvest window, not the clock.
    compiledDay: Number(gs.meta?.clock?.day) || 1,
    compiledMinutes: Number(gs.meta?.clock?.minutes) || 0,
    forSleep,
    slots: {
      form: form.id,
      perspective: pieces.perspective.id,
      tempo: pieces.tempo.id,
      register: pieces.register.id,
      lens: pieces.lens.id,
      distortion: pieces.distortion.id,
      setting: pieces.setting,
    },
    cast: pieces.cast,
    motif: pieces.motif,
    residue,
    source: {
      // D26's minted keys, carried through from whichever unseen_event
      // fragments were picked. Phase 7 or 9 is what pushes them into
      // world.dreams.consumedEventIds; nothing here writes to the ring.
      eventIds: residue.map((f) => f.sourceKey).filter(Boolean),
      episodeKeys: pieces.episodeKeys || [],
    },
    recurrenceOf: pieces.recurrenceOf || null,
    // D11: which beat of the form carries the change this time. Null for
    // everything that is not a recurring dream; buildDreamPrompt branches on
    // it. Additive, and the D32 beat-id alignment is untouched by it.
    shiftedBeat: pieces.shiftedBeat || null,
    panels: [],
    // D12: the register owns the morning, and these are the only numbers a
    // dream ever applies. Phase 7 hands them to applyEffects.
    wake: {
      moodDelta: Number(pieces.register.moodDelta) || 0,
      energyDelta: Number(pieces.register.energyDelta) || 0,
      band: pieces.register.band,
    },
    status: 'compiled',
  };

  // D4: the form's beats ARE the panel count. No separate roll, ever.
  for (let i = 0; i < form.beats.length; i++) {
    const beat = form.beats[i];
    dream.panels.push({
      beat: beat.id,
      prompt: composeDreamPanelPrompt(dream, beat, gs),
      seed: hashStr(composeDreamPanelKey(dream, i)),
      text: '',
    });
  }

  return dream;
}

// --- The 'distorted' branch (the original Phase 4 cast, untouched) ------
// Draws its ten choices in exactly the order Phase 4 established, so every
// existing save re-casts its distorted dreams identically now that the class
// roll sometimes routes elsewhere.
function compileDistortedDream(gs, opts, head) {
  const { rng, forSleep } = head;
  const pool = Array.isArray(opts.residue) ? opts.residue : harvestResidue(gs, { day: opts.day });

  // A nap draws napOnly forms and a night dream never does (D16). One filter,
  // both directions, so a new fragment form can never leak into a night.
  const form = dreamPick(rng, dreamPool(DREAM_FORMS, (f) => (f.napOnly === true) === (forSleep === 'nap')), dreamAbstractionMult);
  const register = dreamPick(rng, dreamPool(DREAM_REGISTERS, dreamRegisterAllowed), dreamRegisterMult);
  const perspective = dreamPick(rng, dreamPool(DREAM_PERSPECTIVES), null);
  const tempo = dreamPick(rng, dreamPool(DREAM_TEMPO), null);
  const lens = dreamPick(rng, dreamPool(DREAM_LENSES), dreamAbstractionMult);
  const distortion = dreamPick(rng, dreamPool(DREAM_DISTORTIONS), dreamAbstractionMult);
  const setting = selectDreamSetting(rng, gs, form, pool);
  const cast = selectDreamCast(rng, gs, pool);
  const motif = selectDreamMotif(rng, gs);
  const residue = selectDreamResidue(rng, pool, cast);

  return finishDreamRecord(gs, head, {
    kind: 'distorted',
    form, register, perspective, tempo, lens, distortion, setting, cast, motif, residue,
    episodeKeys: [], recurrenceOf: null, shiftedBeat: null,
  });
}

// --- Phase 9: true dreams (D9) -------------------------------------------
// A 'true' dream replays, faithfully and from the outside, something real the
// player never witnessed: an off-screen world event (still flagged
// seenByPlayer:false) or an NPC episode (filed under an emotional tag the
// player has no route to). Selection uses the SAME scoring the harvester
// does - base weight, emotional tag, importance, decay, recency - because
// this is still the same pool, asked for its single loudest member instead
// of a handful.
//
// D9's day rule: strictly EARLIER than the night the dream is for. The queue
// top-up runs mid-night and at the day rollover, and a world event the player
// has not been told about yet is exactly the material a true dream must never
// touch: the last sleepEvents batch is narrated and then flipped to
// seenByPlayer in the same breath, so `day < nightDay` keeps the dream a day
// behind the truth. (The mid-night compile runs while the post-midnight half
// of tonight's batch already sits in world.events at day == nightDay, so
// excluding `day >= nightDay` entirely is what keeps tonight's secrets out of
// tonight's dream; the batch's pre-midnight half, at day nightDay-1, cannot
// survive to a queue the same night presents - compiling, writing and
// rendering take minutes and the night takes seconds - so the strict day rule
// plus the narration order is sufficient.)
//
// Returns the source {kind:'event'|'episode', key, day, npcId, text, weight}
// or null. NO DRAWS: a null return must leave the rng untouched so the
// dispatcher can fall through to the distorted cast.
function selectTrueDreamSource(gs, opts = {}) {
  const R = DREAM_TUNING.residue;
  const npcs = (gs.npcs && typeof gs.npcs === 'object') ? gs.npcs : {};
  const nightDay = Number.isFinite(opts.day) ? Math.floor(opts.day) : (Number(gs.meta?.clock?.day) || 1);
  const since = nightDay - (Number.isFinite(DREAM_TUNING.residueDays) ? DREAM_TUNING.residueDays : 3);
  const consumedRaw = gs.world?.dreams?.consumedEventIds;
  const consumed = new Set(Array.isArray(consumedRaw) ? consumedRaw : []);

  let best = null;
  const consider = (candidate) => {
    if (!best || candidate.weight > best.weight ||
        (candidate.weight === best.weight && candidate.key < best.key)) best = candidate;
  };

  const events = Array.isArray(gs.world?.events) ? gs.world.events : [];
  for (const e of events) {
    if (!e || e.seenByPlayer) continue;
    if (!Number.isFinite(e.day) || e.day < since || e.day >= nightDay) continue;
    const key = dreamEventKey(e);
    if (consumed.has(key)) continue;
    const said = residueClause(typeof formatEventText === 'function' ? formatEventText(e, npcs) : e.template);
    if (!said) continue;
    consider({
      kind: 'event', key, day: e.day, npcId: e.npcId, roomId: e.roomId,
      text: said,
      weight: residueBase('unseen_event') * residueRecency({ day: nightDay, R }, e.day),
    });
  }

  for (const npcId of Object.keys(npcs).sort()) {
    const eps = npcs[npcId]?.memory?.episodes;
    if (!Array.isArray(eps)) continue;
    const name = residueName(npcs, npcId);
    for (const ep of eps) {
      if (!ep || !ep.text || !Number.isFinite(ep.day)) continue;
      if (ep.day < since || ep.day >= nightDay) continue;
      const decay = Number.isFinite(ep.decay) ? ep.decay : 1;
      if (decay <= R.episodeDecayFloor) continue;
      const tag = String(ep.emotionalTag || '');
      const emo = EMOTIONAL_WEIGHTS[tag];
      if (!tag || !Number.isFinite(emo)) continue;
      const importance = Number.isFinite(ep.importance) ? ep.importance : MEMORY_IMPORTANCE.conversational;
      const clause = residueClause(ep.text);
      if (!clause) continue;
      const key = dreamEpisodeKey(npcId, ep);
      if (consumed.has(key)) continue;
      consider({
        kind: 'episode', key, day: ep.day, npcId,
        text: clause,
        weight: residueBase('unseen_event') * emo * importance * decay * residueRecency({ day: nightDay, R }, ep.day),
      });
    }
  }

  return best;
}

function compileTrueDream(gs, opts, head) {
  const { rng, forSleep } = head;
  const source = selectTrueDreamSource(gs, opts);
  if (!source) return null;

  // The source clause WITHOUT the harvester's secrecy tail: the writer must
  // replay the event itself, not its being kept from the dreamer. The same
  // fragment feeds the setting/cast selectors AND the writer's replay block,
  // because a true dream casts from its own subject the way any other dream
  // casts from its residue.
  const fragment = makeResidueFragment('unseen_event', source.weight, source.text, {
    npcId: source.npcId,
    day: source.day,
    ...(source.roomId ? { roomId: source.roomId } : {}),
    // Only a world event carries a sourceKey: eventIds is the evt: ring, and
    // an episode's id lives in source.episodeKeys instead.
    ...(source.kind === 'event' ? { sourceKey: source.key } : {}),
  });
  const pool = [fragment];

  const form = dreamPick(rng, dreamPool(DREAM_FORMS, (f) => (f.napOnly === true) === (forSleep === 'nap')), dreamAbstractionMult);
  const register = dreamPick(rng, dreamPool(DREAM_REGISTERS, dreamRegisterAllowed), dreamRegisterMult);
  const perspective = dreamPick(rng, dreamPool(DREAM_PERSPECTIVES), null);
  const tempo = dreamPick(rng, dreamPool(DREAM_TEMPO), null);
  const lens = dreamPick(rng, dreamPool(DREAM_LENSES), dreamAbstractionMult);
  // D9: the place is exactly right. No distortion draw - the slot is pinned
  // to 'none' so the picture and the prose both render an accurate room.
  const distortion = DREAM_DISTORTIONS.none;
  const setting = selectDreamSetting(rng, gs, form, pool);
  const cast = selectDreamCast(rng, gs, pool);
  const motif = selectDreamMotif(rng, gs);
  const residue = [fragment];

  return finishDreamRecord(gs, head, {
    kind: 'true',
    form, register, perspective, tempo, lens, distortion, setting, cast, motif, residue,
    episodeKeys: source.kind === 'episode' ? [source.key] : [],
    recurrenceOf: null, shiftedBeat: null,
  });
}

// --- Phase 9: recurring dreams (D11) -------------------------------------
// A 'recurring' dream re-runs an already-SHOWN dream: the same form, cast,
// setting and motif, re-told with one beat shifted, a re-rolled lens and a
// re-rolled tempo. The diary is the only eligible pool - a compiled-but-never-
// shown dream was never experienced, so repeating it would be the first time.
// Selection takes the newest eligible entry, which needs no RNG: the newest
// shown dream of the right length is the one the dreamer remembers.
//
// D16 applies here too: a nap only re-runs a nap and a night only a night,
// because the form is filtered by forSleep at compile time and the re-run
// must stay in the pool it was first drawn from.
function selectRecurringSource(gs, forSleep) {
  const diary = Array.isArray(gs?.world?.dreams?.diary) ? gs.world.dreams.diary : [];
  for (const d of diary) {
    if (!d || d.status !== 'shown') continue;
    const form = d.slots && DREAM_FORMS[d.slots.form];
    if (!form || !Array.isArray(form.beats) || form.beats.length === 0) continue;
    if ((form.napOnly === true) !== (forSleep === 'nap')) continue;
    if (!d.slots.setting || !Array.isArray(d.cast) || !d.motif || !Array.isArray(d.residue)) continue;
    return d;
  }
  return null;
}

function compileRecurringDream(gs, opts, head) {
  const { rng, forSleep } = head;
  const origin = selectRecurringSource(gs, forSleep);
  if (!origin) return null;
  const form = DREAM_FORMS[origin.slots.form];

  // D11's re-telling: the lens and tempo are re-rolled (the same dream seen
  // through different glass), one beat is re-rolled as the shift, and the
  // register and perspective are re-rolled as the dream's own weather. The
  // setting, cast and motif are PRESERVED - D28(c) reproduces a recurring
  // dream's place, and a cast or motif that changed would read as a different
  // dream, which is the one thing a recurring dream cannot be.
  const lens = dreamPick(rng, dreamPool(DREAM_LENSES), dreamAbstractionMult);
  const tempo = dreamPick(rng, dreamPool(DREAM_TEMPO), null);
  const shifted = form.beats[Math.floor(rng() * form.beats.length)];
  const register = dreamPick(rng, dreamPool(DREAM_REGISTERS, dreamRegisterAllowed), dreamRegisterMult);
  const perspective = dreamPick(rng, dreamPool(DREAM_PERSPECTIVES), null);
  const distortion = dreamPick(rng, dreamPool(DREAM_DISTORTIONS), dreamAbstractionMult);

  // Shallow copies, so nothing in a freshly compiled record aliases the diary
  // entry it re-runs (the standing purity rule).
  const residue = (Array.isArray(origin.residue) ? origin.residue : []).map((f) => ({ ...f }));
  const cast = (Array.isArray(origin.cast) ? origin.cast : []).map((c) => ({ ...c }));
  // The setting and the motif are copied for the same reason the cast and the
  // residue are, and they were missed the first time: a preserved slot handed
  // over BY REFERENCE makes the fresh record and the diary entry the same
  // object, so anything that ever writes to a compiled dream's place or motif
  // silently edits the memory it was re-run from. Nothing writes to them
  // today, which is exactly why it would have gone unnoticed.
  const setting = { ...origin.slots.setting };
  const motif = { ...origin.motif };

  return finishDreamRecord(gs, head, {
    kind: 'recurring',
    form, register, perspective, tempo, lens, distortion,
    setting,
    cast, motif, residue,
    episodeKeys: Array.isArray(origin.source?.episodeKeys) ? origin.source.episodeKeys : [],
    recurrenceOf: origin.id,
    shiftedBeat: shifted.id,
  });
}

// --- Phase 5: the writer's half ------------------------------------------
// compileDream hands over a finished skeleton with empty panels[].text.
// Everything below turns a model reply into those strings, or produces them
// from authored templates when there is no usable reply.
//
// The division of labour, and it is the same one x5.js draws: the CALL lives
// in llm.js (buildDreamPrompt + callDreamweaver, beside callAssessor and
// callChronicler), and everything pure - reading the reply, cleaning it,
// deciding whether it is a panel at all, and the templated fallback - lives
// here. Nothing in this section is async and nothing here reaches
// root.generateText.
//
// WHAT THE WRITER IS AND IS NOT ALLOWED TO RETURN (D1). It returns panel
// PROSE. It does not return a form, a cast, a register, a mood, a panel count
// or a title, and parseDreamweaverReply drops every key that is not panel
// text rather than trusting the prompt to have been obeyed - the same
// enforcement stripWriterJudgement does for the scene writer, for the same
// reason: a model will volunteer a field from habit, and a field that is read
// is a field the model decides.

// The neutral subject the fallback templates use when the compiler cast
// nobody. Phrasing lives here rather than in DREAM_TUNING for D27's reason: a
// phrase is not a dial.
const DREAM_FALLBACK_NO_ONE = 'somebody whose face you cannot hold on to';
// ...and the material the templates fall back to when a degenerate save
// produced no residue and no motif at all. Both are noun phrases, because
// every {motif} and {residue} slot in defs.dreams.js sits where one goes.
const DREAM_FALLBACK_NO_MOTIF = 'something you had been carrying and have put down somewhere';
const DREAM_FALLBACK_NO_RESIDUE = 'a thing from the day that will not come back in daylight';

// --- Reading the reply ---------------------------------------------------

// The expected shape, and the only one:
//   { "panels": [ { "beat": "arrival", "text": "..." }, ... ] }
//
// `beat` is asked for and USED - a reply whose beats match the compiled ones
// is assigned by beat id rather than by position. That is not ceremony: the
// beats of a form are ordered (descent is arrival -> wrongness -> submersion)
// and each panel's IMAGE was already frozen against its beat at compile time,
// so a reply that arrives out of order and is assigned positionally paints
// submersion prose under an arrival picture and nothing anywhere would say
// so. Matching on the id costs one Map and makes that class of failure
// impossible. It is not a structural decision by the model: the beats, their
// order and their number were all decided by compileDream, and a beat the
// model invents matches nothing and falls through to position.
//
// Returns { panels: [string x panelCount], tier } or null. tier follows
// callLLM's ladder exactly - 1 clean parse, 2 brace-matched, 3 regex sweep -
// so LLM_TELEMETRY's parseTiers means the same thing for this call as for
// every other one.
function parseDreamweaverReply(text, dream) {
  const beats = Array.isArray(dream?.panels) ? dream.panels.map((p) => p.beat) : [];
  const want = beats.length;
  if (want === 0) return null;

  const parsed = (typeof x5ParseJsonObject === 'function') ? x5ParseJsonObject(text) : null;
  if (parsed) {
    const assigned = assignDreamPanels(parsed.obj, beats);
    if (assigned) return { panels: assigned, tier: parsed.tier };
    // Fall through: an object that parsed but carried no usable panels is
    // still worth a regex sweep, because the commonest version of it is a
    // reply whose prose was truncated inside the array.
  }

  // Tier 3 - sweep the raw text for "text": "..." runs. A reply mangled past
  // JSON.parse can still carry every panel intact, and the grammar here is
  // flat enough to read directly. Positional only: a sweep has no reliable
  // pairing between a beat and the text that followed it.
  if (typeof text !== 'string' || !text.trim()) return null;
  const re = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = dreamPanelText(unescapeJsonish(m[1]));
    if (t) found.push(t);
  }
  if (found.length < want) return null;
  return { panels: found.slice(0, want), tier: 3 };
}

// The strip (D1). Only `panels` is read off the reply object, only `beat` and
// `text` are read off an entry, and a bare string entry is accepted because a
// model that was asked for objects and returned strings has still done the
// one job it was given. Everything else the model volunteered - a mood, a
// title, a register, a fourth panel - is dropped here rather than downstream.
//
// All-or-nothing on purpose. A dream is one artifact, and two written panels
// beside one blank is worse to look at than three templated ones; the caller
// falls back to buildDreamFallback for the whole record instead.
function assignDreamPanels(obj, beats) {
  const raw = Array.isArray(obj?.panels) ? obj.panels : null;
  if (!raw) return null;

  const byBeat = new Map();
  const positional = [];
  for (const entry of raw) {
    if (typeof entry === 'string') { positional.push(dreamPanelText(entry)); continue; }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { positional.push(''); continue; }
    const t = dreamPanelText(entry.text);
    positional.push(t);
    const b = typeof entry.beat === 'string' ? entry.beat.trim() : '';
    if (b && t && !byBeat.has(b)) byBeat.set(b, t);
  }

  const out = [];
  for (let i = 0; i < beats.length; i++) {
    const t = byBeat.get(beats[i]) || positional[i] || '';
    if (!t) return null;
    out.push(t);
  }
  return out;
}

// JSON string escapes, undone by hand - the tier-3 sweep reads its matches
// out of text that JSON.parse already refused, so there is no parser left to
// do it. Only the escapes a prose panel can actually contain.
function unescapeJsonish(s) {
  return String(s)
    .replace(/\\n/g, ' ').replace(/\\r/g, ' ').replace(/\\t/g, ' ')
    .replace(/\\"/g, '"').replace(/\\'/g, "'")
    .replace(/\\u2019/gi, '’').replace(/\\u2014/gi, '—')
    .replace(/\\\\/g, '\\');
}

// One panel's prose, cleaned and bounded. Returns '' for anything that is not
// a panel, which is what makes assignDreamPanels' all-or-nothing test a
// single falsy check.
//
// The ceiling trims at the last SENTENCE boundary inside
// DREAM_TUNING.panelWordHardMax rather than at the word itself: an
// over-length panel is a model that kept going, and cutting it mid-clause
// turns a verbose dream into a visibly broken one. The floor rejects
// outright, because there is no repair for four words.
function dreamPanelText(raw) {
  if (typeof raw !== 'string') return '';
  let t = raw
    .replace(/```[a-z]*/gi, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // A label the model wrote into the prose rather than into the `beat` field.
  t = t.replace(/^(?:panel|beat)\s*\d*\s*[:.–—-]\s*/i, '').trim();
  if (!t) return '';

  const words = t.split(' ');
  if (words.length < DREAM_TUNING.panelWordHardMin) return '';
  if (words.length > DREAM_TUNING.panelWordHardMax) {
    const cut = words.slice(0, DREAM_TUNING.panelWordHardMax).join(' ');
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    t = stop > 0 ? cut.slice(0, stop + 1) : cut.replace(/[,;:\s]+$/, '') + '.';
  }
  return t;
}

// --- The fallback --------------------------------------------------------

// Per-beat templated prose, so a total model failure still yields a legal,
// showable dream rather than a window of empty panels. The templates are
// authored on the BEATS in defs.dreams.js (D6) - a form added there is
// showable the moment it is written, with no edit here.
//
// PURE AND DETERMINISTIC WITHOUT AN RNG: it takes no draw at all, from any
// stream. Everything that varies between two fallbacks varies because the
// compiled record differs, which means the same record produces the same
// prose forever - including when the Dream Diary rebuilds a page weeks later.
//
// `gs` is optional and only supplies cast NAMES; without it {who} degrades to
// DREAM_FALLBACK_NO_ONE rather than throwing, which is the shape a diary
// repaint and a harness both want.
function buildDreamFallback(dream, gs) {
  const form = DREAM_FORMS[dream?.slots?.form];
  if (!form || !Array.isArray(form.beats)) return [];

  const who = dreamFallbackWho(dream, gs);
  const where = dreamSettingProsePlace(dream?.slots?.setting);
  const motif = (dream?.motif && dream.motif.text) || DREAM_FALLBACK_NO_MOTIF;
  const residue = Array.isArray(dream?.residue) ? dream.residue.filter((f) => f && f.text) : [];

  // Fragments are handed out in POOL ORDER to the panels that actually ask
  // for one, rather than indexed by panel number. The difference is not
  // cosmetic: the pool arrives loudest-first, and no form today puts
  // {residue} in its first beat, so indexing by panel would mean the loudest
  // thing in the dreamer's day never reached a descent or an undoing at all.
  // Counting only the beats that consume one also means a form authored later
  // with two residue slots gets two DIFFERENT fragments for free, which is the
  // repetition this ordering exists to prevent.
  let taken = 0;
  return form.beats.map((beat) => {
    const tpl = typeof beat.fallback === 'string' ? beat.fallback : '';
    let frag = DREAM_FALLBACK_NO_RESIDUE;
    if (tpl.includes('{residue}') && residue.length) {
      frag = residue[taken % residue.length].text;
      taken++;
    }
    return dreamFallbackFill(tpl, { who, where, motif, residue: frag });
  });
}

// The first cast member's name, whatever their role. Deliberately NOT
// skipping an 'absent' member: every template that uses {who} needs a
// grammatical subject, and "the person who is not here is here" is worse
// than naming them - a dream about somebody who is not there still knows
// exactly who it is not.
function dreamFallbackWho(dream, gs) {
  const cast = Array.isArray(dream?.cast) ? dream.cast : [];
  for (const member of cast) {
    const name = gs?.npcs?.[member?.npcId]?.bible?.name;
    if (name) return String(name);
  }
  return DREAM_FALLBACK_NO_ONE;
}

// The setting as something that can follow the word "in". An apartment
// setting resolves its real room through roomPhrase (config.js) rather than
// through a second copy of the room list in defs.dreams.js (design invariant
// 7); everything else reads its authored fallbackPlace.
function dreamSettingProsePlace(setting) {
  const entry = DREAM_SETTINGS[setting?.settingId];
  if (!entry) return DREAM_SETTINGS.home ? DREAM_SETTINGS.home.fallbackPlace : 'the flat';
  if (entry.sourceKind === 'apartment' && setting.roomId) return residueRoomPhrase(setting.roomId);
  return entry.fallbackPlace;
}

// Fill, then sentence-case EVERY sentence rather than only the first.
//
// This is not tidying. Every value that reaches a slot is a lowercase clause
// by construction - residueRoomPhrase lowercases so a room reads mid-sentence,
// a motif's `text` is authored as a fragment ("music through a wall, too quiet
// to name the song"), and a residue clause comes out of the harvester the
// same way. Most templates put those mid-sentence, where lowercase is right;
// a dozen of them open a sentence on one, where it is not. Casing at fill time
// means a template author never has to think about which position a slot is in
// and can never get it wrong.
//
// Whose job this is NOT: the tables'. Capitalising the material at source
// would break every mid-sentence use and would put the same clause in the
// diary in two different cases.
function dreamFallbackFill(tpl, vars) {
  if (typeof tpl !== 'string' || !tpl) return '';
  const filled = tpl.replace(/\{(who|where|motif|residue)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return filled.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, lead, ch) => lead + ch.toUpperCase());
}

// --- The write ------------------------------------------------------------

// The ONLY thing Phase 5 writes, and it writes it to the record the caller
// owns rather than to world.dreams: panels[].text, and status -> 'written'.
// Nothing else on the record is touched, and nothing outside it is touched at
// all. The moment this function also set a mood, a slot or a cast, the model
// would be deciding structure through the back door (D1).
//
// Kept out of llm.js on purpose: that file's standing contract is that it
// returns proposals and never writes state, and callDreamweaver honours it by
// handing back { ok, panels } for this function to apply.
//
// Returns true only when every panel got real prose. A partial write is
// refused outright and `status` stays 'compiled', so a half-written dream can
// never reach the queue looking finished.
function applyDreamPanelText(dream, texts) {
  if (!dream || !Array.isArray(dream.panels) || !Array.isArray(texts)) return false;
  if (texts.length !== dream.panels.length || texts.length === 0) return false;
  for (const t of texts) if (typeof t !== 'string' || !t.trim()) return false;
  for (let i = 0; i < dream.panels.length; i++) dream.panels[i].text = texts[i].trim();
  dream.status = 'written';
  return true;
}

// The motif's authored instruction, resolved rather than stored - the exact
// mirror of dreamMotifImageFragment, and for the same reason: the record
// keeps { motifId, text, carriedFrom } and a directive copied onto it would
// be authored data living in two places. Three sources in order: the authored
// table, the player's current possessions, and '' for a carried motif whose
// item has since been sold or eaten, where the record's own `text` already
// carries everything the prompt needs.
function dreamMotifDirective(gs, motif) {
  if (!motif || !motif.motifId) return '';
  const authored = DREAM_MOTIFS[motif.motifId];
  if (authored) return authored.directive || '';
  const item = harvestItemMotifs(gs).find((m) => m.id === motif.motifId);
  return item ? (item.directive || '') : '';
}

// --- Phase 6: rendering and the queue -------------------------------------
// Everything above this line is pure. This is the half that talks to the
// model, the image plugin and the save, and it exists to make sure that by
// the time the player clicks Sleep there is nothing left to do but look.
//
// THE ONE RULE (design invariant 3): never generate on the sleep click. A
// dream is compiled, written and rendered in the background, hours of game
// time early, and parked in world.dreams.queue. If the queue is empty the
// player does not dream — silently, with no wait and no spinner. A sleep
// button that hung on an LLM call and three image generations would be the
// loud version of the castWeb failure this project keeps as its standing
// lesson about invisible bugs.
//
// The shape is startInterruptionPreGeneration's (interruption.js): fire
// un-awaited, do the slow work against a captured record, and re-validate
// against the LIVE currentGameState at resolution rather than the reference
// captured before the first await — resolveBatch replaces that object, and
// interruption.js documents exactly why trusting the captured one is wrong.

// D20's single flight. Module-level rather than per-state, because the
// resource being protected is the model and image quota, not the save: two
// overlapping top-ups would spend twice and race each other's queue write.
let dreamGenInFlight = false;

// The per-sleep probability behind the player's Frequency dial. D24 puts the
// real numbers on DREAM_FREQUENCIES (defs.settings.js) and nowhere else, so
// this resolves the id rather than restating the table. Phase 6 only needs
// the 'off' case — that option's own comment promises "no compile, no
// background render, no image quota spent", and this is where that promise is
// kept. Phase 7's shouldDream() rolls against the number.
function dreamFrequencyChance() {
  const id = dreamOptionId('dreamFrequency');
  if (typeof DREAM_FREQUENCIES === 'undefined' || !Array.isArray(DREAM_FREQUENCIES)) {
    return id === 'off' ? 0 : 0.5;
  }
  const opt = DREAM_FREQUENCIES.find((o) => o.id === id);
  return opt ? (Number(opt.chance) || 0) : 0;
}

// D22: a validity re-check at consumption, NOT a freshness re-roll. A dream
// compiled from two-day-old residue is fine — that is what dreams are, and
// re-rolling one because the day turned would defeat the whole point of
// queueing them. What is not fine is a dream about somebody who has left.
//
// Four ways a queued record goes bad, and only four:
//   the cast moved out or was never there   — the D22 case
//   its form left the tables                — a data edit between sessions
//   its register is no longer permitted     — sfwMode flipped ON after an
//                                             `erotic` dream was queued; the
//                                             gate is hard and independent of
//                                             every weight (D17), so it has
//                                             to hold at the queue's exit as
//                                             well as at selection
//   it never got its prose                  — D33: status stays 'compiled'
//                                             when applyDreamPanelText
//                                             refused a partial write
// The register check reuses the compiler's own filter rather than naming
// 'erotic', so a future gated register is covered without a second home.
function dreamStillValid(gs, dream) {
  if (!gs || !dream || !Array.isArray(dream.panels) || dream.panels.length === 0) return false;
  if (dream.status !== 'written' && dream.status !== 'rendered') return false;
  const form = DREAM_FORMS[dream.slots?.form];
  if (!form || form.beats.length !== dream.panels.length) return false;
  const register = DREAM_REGISTERS[dream.slots?.register];
  if (!register || !dreamRegisterAllowed(register)) return false;
  for (const member of (dream.cast || [])) {
    const npc = gs.npcs?.[member.npcId];
    if (!npc || npc.residency?.status === 'former') return false;
  }
  return true;
}

// D19's queue, read as "one night dream and one nap dream", which with
// queueCap 2 is the only reading that lets D16 happen at all: a nap consumes
// a napOnly single-panel form, and a queue holding two night dreams would
// mean naps could only ever dream by generating on the click. Night is
// filled first because it is the common case and the more expensive record
// (up to three panels against a nap's one).
//
// Returns the forSleep kind the queue is missing, or null when it is full.
function nextDreamSlot(gs) {
  const queue = gs?.world?.dreams?.queue;
  if (!Array.isArray(queue)) return null;
  if (queue.length >= DREAM_TUNING.queueCap) return null;
  const have = new Set(queue.map((d) => d && d.forSleep));
  if (!have.has('night')) return 'night';
  if (!have.has('nap')) return 'nap';
  return null;
}

// D21: SEQUENTIALLY, never Promise.all. There is no concurrency cap anywhere
// in image.js outside the menu gallery, so three parallel panel generations
// from a background pass would contend with the scene plate and the cutouts
// the player is actually looking at right now.
//
// All-or-nothing, for design invariant 3's reason rather than for looks: a
// dream queued with one panel un-rendered is a dream that generates a picture
// on the sleep click. Returns false and the record is dropped; its index is
// already spent, so the next top-up compiles a fresh dream rather than
// retrying this one against a stale cache key.
async function renderDreamPanels(dream) {
  for (let i = 0; i < dream.panels.length; i++) {
    // image.js owns every generateImage call in the codebase (design
    // invariant of that file): going direct from here would bypass both the
    // shared LRU and applyImageStyle's funnel.
    const res = await getDreamPanelImage(dream, i);
    if (!res || !res.url) return false;
  }
  return true;
}

// D20: the live state, not the one captured before the first await.
// resolveBatch replaces currentGameState with a NEW object, so a reference
// held across an LLM call and three image generations is stale by the time
// the write happens. Falls back to the caller's reference when there is no
// ui.js in scope at all, which is the Node harness and nothing else.
function liveDreamGameState(gs) {
  return (typeof currentGameState !== 'undefined' && currentGameState) ? currentGameState : gs;
}

// Top up world.dreams.queue by ONE dream, in the background, never blocking.
// compile -> weave -> render -> park. Fire it un-awaited; it resolves in its
// own time and writes only if the world it was compiled for is still there.
//
// Returns true only when a dream actually reached the queue. Never throws:
// this runs on a fire-and-forget path where a throw presents as an unhandled
// rejection in the console and a silently dreamless playthrough, which is
// precisely the failure this engine is not allowed to have.
async function topUpDreamQueue(gs) {
  if (dreamGenInFlight) return false;
  if (!gs || !gs.world || !gs.meta) return false;
  // 'off' is a hard stop before anything is spent (D24 / DREAM_FREQUENCIES).
  if (dreamFrequencyChance() <= 0) return false;

  gs.world.dreams = gs.world.dreams || defaultDreamState();
  const forSleep = nextDreamSlot(gs);
  if (!forSleep) return false;

  dreamGenInFlight = true;
  try {
    // Reserve the index SYNCHRONOUSLY, before the first await, and spend it
    // whether or not this attempt succeeds. dream.id is a pure function of
    // (save seed, index) and every panel cache key is a function of dream.id,
    // so two different compiles sharing an index would share cache keys and a
    // retry after a partial render could paint yesterday's pixels under
    // today's prose. An index is cheap; that collision is not. This write is
    // the engine's own bookkeeping inside world.dreams, which is one of the
    // two writes design invariant 2 permits.
    const index = Number(gs.world.dreams.nextIndex) || 1;
    gs.world.dreams.nextIndex = index + 1;

    const dream = compileDream(gs, { forSleep, index });
    if (!dream) return false;

    // Phase 5's contract: callDreamweaver never throws and returns
    // { ok, panels }; applyDreamPanelText refuses a partial rather than
    // half-writing (D33). A reply that cannot fill every panel templates the
    // WHOLE dream, so the second call below is a fallback for the writer
    // failing AND for an ok reply that somehow still would not apply.
    const res = await callDreamweaver(gs, dream);
    let written = res && res.ok ? applyDreamPanelText(dream, res.panels) : false;
    if (!written) written = applyDreamPanelText(dream, buildDreamFallback(dream, gs));
    // status stays 'compiled', and a dream that never reached 'written' has
    // no prose to show. Dropping it is the only correct move.
    if (!written) return false;

    if (!(await renderDreamPanels(dream))) return false;

    // --- The write, against the LIVE state (D20) ---
    const live = liveDreamGameState(gs);
    if (!live || !live.world || !live.meta) return false;
    // A different save loaded while this was generating. The dream was cast
    // from a world that is no longer on screen; handing it to this one would
    // put strangers in it.
    if (live.meta.seed !== gs.meta.seed) return false;
    live.world.dreams = live.world.dreams || defaultDreamState();
    const st = live.world.dreams;
    if (!Array.isArray(st.queue)) return false;
    // The slot may have been filled, or the cast may have moved out, while
    // the model and the image plugin were working.
    if (nextDreamSlot(live) !== forSleep) return false;
    if (!dreamStillValid(live, dream)) return false;

    dream.status = 'rendered';
    st.queue.push(dream);
    // Unreachable given the slot check above, and kept anyway: a cap that is
    // only enforced by the code path that happens to be in front of it is a
    // cap that is one refactor from being no cap at all. Oldest out, never
    // the one just added.
    while (st.queue.length > DREAM_TUNING.queueCap) st.queue.shift();
    // The reservation happened on `gs`, which may not be `live`.
    st.nextIndex = Math.max(Number(st.nextIndex) || 1, index + 1);

    await saveAtBoundary('dream', live);
    return true;
  } catch (e) {
    console.warn('Dream queue top-up failed:', e && e.message);
    return false;
  } finally {
    dreamGenInFlight = false;
  }
}

// --- Phase 7: consumption, the wake tint, and the diary -------------------
// The other end of the pipeline. Phase 6 fills world.dreams.queue in the
// background; everything below spends what is in it when the player sleeps or
// naps, and files what was shown.
//
// NOTHING HERE GENERATES ANYTHING. No compile, no model call, no image. If the
// queue is empty the player does not dream, silently (design invariant 3). The
// panels this shows were rendered long before the click and are read back out
// of the shared image cache by presentDream (actionwindow.js) through
// image.js's getDreamPanelImage - a cache HIT on every normal path.
//
// The writes this section makes, and they are the only two categories design
// invariant 2 permits:
//   the wake tint      - applyEffects on the register's own moodDelta /
//                        energyDelta (D12), which is the single sim write a
//                        dream is ever allowed
//   world.dreams       - the queue splice, the diary, the motif history, the
//                        consumed-event ring and lastDreamDay: the engine's
//                        own bookkeeping
// A knowledge fact, a relationship axis, an NPC memory or a seenByPlayer flag
// written from this section would turn the dream into an oracle and break the
// information economy the rest of the game runs on (D7 is only safe because of
// that asymmetry).

// Does this sleep dream at all? A seeded roll against the player's Frequency
// dial (D24 owns the number), damped for naps by DREAM_TUNING.napChanceMult
// (D16) - so `off` stays a hard zero for both, without a second check.
//
// The roll draws from ITS OWN stream, keyed on the day and the kind, for two
// reasons. Design invariant 5 is the first: a draw from the global sequence
// would shift every existing seed's cast. The second is that a per-day seed
// makes the answer STABLE - reloading the save and clicking Sleep again cannot
// re-roll a dream into existence, which matters because a queued dream is a
// generated asset the player would otherwise have an incentive to fish for.
//
// lastDreamDay caps it at one dream per day across both kinds. A night's sleep
// resolves on the FOLLOWING day (advanceAndResolve has already moved the clock
// by the time doSleep consumes), so a nap on day 5 and the sleep that same
// night do not collide; two naps in one afternoon do.
function shouldDream(gs, forSleep) {
  if (!gs || !gs.meta) return false;
  const kind = forSleep === 'nap' ? 'nap' : 'night';
  const chance = dreamFrequencyChance() * (kind === 'nap' ? (DREAM_TUNING.napChanceMult || 0) : 1);
  if (chance <= 0) return false;
  const day = Number(gs.meta.clock?.day) || 1;
  const last = gs.world?.dreams?.lastDreamDay;
  if (Number.isFinite(last) && last === day) return false;
  const rng = seededRng(gs.meta.seed != null ? gs.meta.seed : 'no-seed', hashStr('dreamroll|' + day + '|' + kind));
  return rng() < chance;
}

// The queued dream for this kind of sleep, or null. D36's queue is one night
// dream and one nap dream, so this looks for the matching `forSleep` rather
// than for queue[0].
//
// It also DROPS every record that no longer validates, both kinds, not just
// the one being asked for. A dream whose cast moved out will never validate
// again, and left in place it holds its slot against nextDreamSlot forever -
// so the player who lost a housemate would quietly stop dreaming at night, and
// the player who switched sfwMode on after an `erotic` dream was queued would
// stop dreaming altogether (D39's register check, seen from the consumption
// side). Pruning is bookkeeping inside world.dreams and nothing else.
function pickQueuedDream(gs, forSleep) {
  const st = gs?.world?.dreams;
  if (!st || !Array.isArray(st.queue) || st.queue.length === 0) return null;
  const kept = st.queue.filter((d) => dreamStillValid(gs, d));
  if (kept.length !== st.queue.length) st.queue = kept;
  return kept.find((d) => d && d.forSleep === forSleep) || null;
}

// The morning the register left behind (D12). Indexed by the dream's own
// frozen seed rather than by any RNG draw, for D34(c)'s reason: the Dream
// Diary reprints this line beside a dream the player read months ago, and a
// record that templated differently on the second read would be a record that
// remembers its own morning wrong.
function dreamWakeLine(dream) {
  const lines = DREAM_WAKE_LINES[dream?.wake?.band];
  if (!Array.isArray(lines) || lines.length === 0) return '';
  const seed = Math.abs(Number(dream.seed) || 0);
  return lines[seed % lines.length];
}

// D12's tint, and the ONLY sim state a dream ever writes. Through applyEffects
// rather than by hand, so it produces real `applied` rows the debug panel and
// any future strip can read - the same rule the action-outcome-window plan's
// design invariant 1 states, and the reason doSleep's own hand-written energy
// mutation is called out as an audit finding rather than copied here.
//
// The numbers are the REGISTER'S, frozen onto the record at compile time
// (defs.dreams.js documents why they are all at or under a nap's). Nothing
// here decides a magnitude; if this function ever contains a number, it is in
// the wrong file.
//
// A trusted producer, so it skips validateEffects exactly as boundary.js and
// the action defs do - that gate is the LLM-input boundary, and a dream's tint
// came from an authored table.
function applyDreamWake(gs, dream) {
  const wake = dream && dream.wake;
  if (!gs || !wake) return [];
  const lines = [];
  const mood = Number(wake.moodDelta) || 0;
  const energy = Number(wake.energyDelta) || 0;
  // Signed DSL values formatted without a stray '+' so Number() never sees
  // '+-0.03' - the same formatting boundary.js's effect lines use.
  if (mood) lines.push('ADJUST_NEED player mood ' + (mood < 0 ? '' : '+') + mood);
  if (energy) lines.push('ADJUST_NEED player energy ' + (energy < 0 ? '' : '+') + energy);
  if (lines.length === 0) return [];
  const effCtx = buildEffectContext(gs, [], [], {}, []);
  const res = applyEffects(lines.map((l) => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
  return res.applied || [];
}

// The dream has been watched. File it: out of the queue, into the diary, its
// motif into the carryover pool (D10), its sources into the dedupe ring (D9),
// and the day stamped so the frequency roll knows it happened.
//
// The WHOLE record goes into the diary, not a projection of it. Phase 8
// repaints the panels from their frozen prompt and seed (D14) and Phase 9's
// recurrence needs the compiled slots, the cast and the motif (D11); a diary
// entry trimmed to what the gallery happens to display today is a decision to
// make Phase 9 impossible, taken by whoever wrote the trim.
function fileDreamToDiary(gs, dream) {
  const st = gs?.world?.dreams;
  if (!st || !dream) return null;
  if (Array.isArray(st.queue)) st.queue = st.queue.filter((d) => d && d.id !== dream.id);
  const day = Number(gs.meta?.clock?.day) || 1;
  dream.status = 'shown';
  dream.shownDay = day;
  dream.shownMinutes = Number(gs.meta?.clock?.minutes) || 0;

  if (!Array.isArray(st.diary)) st.diary = [];
  st.diary.unshift(dream);
  // Newest first, so the OLDEST entry is the one that falls off the end.
  while (st.diary.length > DREAM_TUNING.diaryCap) st.diary.pop();

  if (dream.motif && dream.motif.motifId) {
    if (!Array.isArray(st.motifHistory)) st.motifHistory = [];
    st.motifHistory.unshift({
      motifId: dream.motif.motifId,
      text: dream.motif.text || '',
      dreamId: dream.id,
      day,
    });
    while (st.motifHistory.length > DREAM_TUNING.motifHistoryCap) st.motifHistory.pop();
  }

  // D9: a source spent by a shown dream is never dreamt again. The ring is
  // written HERE rather than at compile time on purpose - a compiled dream
  // that never reached the queue (D38) burned nothing, and burning its sources
  // would quietly retire real material for a dream nobody saw. Both key
  // namespaces ride in: evt: for world events and epi: for NPC episodes,
  // which a true dream spends in exactly the same sense (Phase 9).
  const evIds = (dream.source && Array.isArray(dream.source.eventIds)) ? dream.source.eventIds : [];
  const epIds = (dream.source && Array.isArray(dream.source.episodeKeys)) ? dream.source.episodeKeys : [];
  const sources = evIds.concat(epIds);
  if (sources.length) {
    if (!Array.isArray(st.consumedEventIds)) st.consumedEventIds = [];
    for (const key of sources) if (key && !st.consumedEventIds.includes(key)) st.consumedEventIds.push(key);
    while (st.consumedEventIds.length > DREAM_TUNING.consumedEventCap) st.consumedEventIds.shift();
  }

  st.lastDreamDay = day;
  return dream;
}

// The sleep/nap hook, and the whole of what ui.js has to know about dreaming.
// Roll, take what is queued, show it, tint the morning, file it.
//
// Returns null when there was no dream - which is the common case and is never
// an error: the dial says no, the day already had one, the queue is empty, or
// what was in it no longer validates. Returns { dream, applied, line } when one
// was actually watched, and the CALLER writes the line to the log and saves,
// because narration is the UI layer's and this file has no business deciding
// where a sentence lands.
//
// A dream the window could not show is NOT filed. presentDream resolves null
// when there is no DOM (a harness) or when another window is already open, and
// treating that as "shown" would spend a rendered dream the player never saw
// and stamp lastDreamDay against it. It stays in the queue for the next sleep.
async function playQueuedDream(gs, forSleep) {
  if (!gs || !gs.world || !gs.world.dreams) return null;
  const kind = forSleep === 'nap' ? 'nap' : 'night';
  if (!shouldDream(gs, kind)) return null;
  const dream = pickQueuedDream(gs, kind);
  if (!dream) return null;
  if (typeof presentDream !== 'function') return null;

  const reason = await presentDream(gs, dream);
  if (!reason) return null;

  // D20's live-state rule, in its consumption form: presentDream is awaited
  // across an arbitrary number of player-paced taps, and a save loaded from the
  // pause menu in the middle of one would replace currentGameState. Writing the
  // tint and the diary into the state the dream was TAKEN from would file it
  // into a world that is no longer on screen.
  const live = liveDreamGameState(gs);
  if (!live || live.meta?.seed !== gs.meta?.seed) return null;

  const applied = applyDreamWake(live, dream);
  fileDreamToDiary(live, dream);
  return { dream, applied, line: dreamWakeLine(dream) };
}
