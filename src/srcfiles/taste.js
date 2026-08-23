// ===== SECTION: TASTE (food-overhaul Phase 7, D23/D24) =====
// Per-NPC food preferences. Tastes are DERIVED-but-stable (design note in
// the Open-question "NPC taste source"): a pure function of the character's
// genSeed plus a couple of personality-trait anchors — never stored, so an
// old save needs no migration and the same save always reproduces the same
// tastes. An explicit `npc.taste = { likes, dislikes }` override wins when
// present (the authored-character path and the harnesses).
//
// What tastes DO:
//   - set_meal outcomes (D23) — a fed attendee's relationship and mood
//     deltas are scaled by the TASTE_TUNING band their actual serving lands
//     in (love > like > neutral > dislike > hate), and the narration says
//     which reactions were not neutral.
//   - NPC auto-cook choice (D24) — a hungry NPC with a bare fridge cooks the
//     liked recipe out of the pantry rather than the first available one.
//   - eat-drive tie-breaks — when two foods restore the same hunger, the
//     liked one wins.
// TASTE_TUNING (config.js) is the single owning table; nothing else reads
// the pool or the band multipliers.

// The NPC's taste profile: { likes: [key], dislikes: [key] } — explicit
// override first, derived profile otherwise. Derived output is stable per
// NPC (same genSeed, same personality → same profile, forever).
function npcTaste(npc) {
  const t = npc?.taste;
  if (t && (Array.isArray(t.likes) || Array.isArray(t.dislikes))) {
    return {
      likes: Array.isArray(t.likes) ? [...t.likes] : [],
      dislikes: Array.isArray(t.dislikes) ? [...t.dislikes] : [],
    };
  }
  return deriveNpcTaste(npc);
}

// The derived profile. Seeded from genSeed (persisted on every bible,
// generated and authored alike) so old saves get a stable value without a
// stored field. Trait anchors land first, the seed draw fills the rest —
// `used` is shared across both lists, so nothing can be both liked and
// disliked, and a trait anchor never competes with the draw.
function deriveNpcTaste(npc) {
  const raw = npc?.bible?.genSeed ?? npc?.genSeed ?? null;
  const seedBase = (typeof raw === 'number' && isFinite(raw)) ? raw : hashStr(String(raw ?? npc?.id ?? 'npc'));
  const rng = mulberry32(((seedBase >>> 0) + TASTE_TUNING.seedSalt) >>> 0);
  const traits = npc?.bible?.personality?.traits || [];
  const likes = [];
  const dislikes = [];
  const used = new Set();
  const cap = (arr) => TASTE_TUNING[arr === likes ? 'likesPerNpc' : 'dislikesPerNpc'];
  const push = (arr, key) => {
    // Anchors compete for the same slots as the draw: an NPC always ends
    // with exactly likesPerNpc likes and dislikesPerNpc dislikes, so a
    // strongly trait-anchored NPC's anchors crowd out the seed draw rather
    // than inflating the profile past its target size.
    if (key && !used.has(key) && arr.length < cap(arr)) { arr.push(key); used.add(key); }
  };
  for (const trait of traits) {
    const anchor = TASTE_TUNING.traitAnchors?.[trait];
    if (!anchor) continue;
    for (const k of anchor.likes || []) push(likes, k);
    for (const k of anchor.dislikes || []) push(dislikes, k);
  }
  // Phase 7 Dimension 2 (foodLean): the occupation's foodLean keys become LIKES
  // through the SAME guarded push as the trait anchors — a job tint, not a gate
  // (a lean never hard-empties a pool, D11's spirit) and it can never exceed
  // likesPerNpc (the shared `used` guard + cap already bound it). A sweet lean
  // fills a like slot like any anchor; the draw then fills the rest. Field and
  // reader ship together (RI6).
  const foodLean = npc?.bible?.occupation?.foodLean || [];
  for (const k of foodLean) push(likes, k);
  // The draw pool is RE-FILTERED after each pass: the dislike draw must not
  // hand back a key the like draw already claimed (the shared `used` guard
  // would then drop it and the profile would come up a dislike short).
  let candidates = (TASTE_TUNING.pool || []).map(e => e.key).filter(k => !used.has(k));
  for (const k of pickUnique(rng, candidates, Math.max(0, TASTE_TUNING.likesPerNpc - likes.length))) push(likes, k);
  candidates = (TASTE_TUNING.pool || []).map(e => e.key).filter(k => !used.has(k));
  for (const k of pickUnique(rng, candidates, Math.max(0, TASTE_TUNING.dislikesPerNpc - dislikes.length))) push(dislikes, k);
  return { likes, dislikes };
}

// Does a taste KEY match this ingredient? A defId key matches the exact
// def; a group key matches the def's foodGroup. An unknown key matches
// nothing (fails closed — a typo in a taste override is silent, not an
// always-love bug).
function tasteKeyMatches(key, defId, def) {
  const entry = (TASTE_TUNING.pool || []).find(e => e.key === key);
  if (!entry) return false;
  if (entry.defId) return entry.defId === defId;
  if (entry.group) return entry.group === (def?.foodGroup ?? foodGroupOf(def));
  return false;
}

// The D23 band for a list of { defId, qty } components against a taste
// profile. Weighs by component QUANTITY so a two-egg omelette's eggs count
// double — "mostly liked, one tolerated garnish" reads as like, not love.
// love/hate require a clean sweep on the winning side; a dish with both
// loved and hated parts lands in the winner's softer band.
function tasteBandForComponents(components, taste) {
  let like = 0, dislike = 0, total = 0;
  for (const c of components || []) {
    const q = Math.max(1, c?.qty || 1);
    total += q;
    const def = ITEM_DEFS[c.defId];
    if ((taste?.likes || []).some(k => tasteKeyMatches(k, c.defId, def))) like += q;
    if ((taste?.dislikes || []).some(k => tasteKeyMatches(k, c.defId, def))) dislike += q;
  }
  if (total <= 0) return 'neutral';
  if (like > 0 && dislike === 0) return like >= total / 2 ? 'love' : 'like';
  if (dislike > 0 && like === 0) return dislike >= total / 2 ? 'hate' : 'dislike';
  if (like > dislike) return 'like';
  if (dislike > like) return 'dislike';
  return 'neutral';
}

// The band for a whole stack: a plate reads its instance components (the
// snapshot, invariant 1 — never the recipe table), a def-driven stack
// (restaurant dish, snack) reads its own def as a one-component meal.
function tasteBandForStack(stack, taste) {
  const plate = stack?.meta?.plate;
  if (plate) return tasteBandForComponents(plate.components, taste);
  return tasteBandForComponents([{ defId: stack?.defId, qty: 1 }], taste);
}

// The band a recipe would land in for a taste profile — what an NPC's
// auto-cook choice weighs (D24): they cook the recipe they'd love, not the
// first available one.
function tasteBandForRecipe(recipe, taste) {
  return tasteBandForComponents(recipe?.ingredients, taste);
}

// The TASTE_TUNING.bands row for a band name (always defined — neutral is
// the floor).
function tasteBandRow(band) {
  return TASTE_TUNING.bands?.[band] || TASTE_TUNING.bands.neutral;
}

// { name, band } for every NPC who has a non-neutral reaction to a stack —
// the spread-picker's taste notes and the set_meal narration both read
// this; the neutral ones are the point (no callout = nothing to say).
function tasteNoteList(stack, npcs) {
  const out = [];
  for (const n of npcs || []) {
    if (!n?.npc) continue;
    const band = tasteBandForStack(stack, npcTaste(n.npc));
    if (band === 'neutral') continue;
    out.push({ name: n.npc?.bible?.name || 'Someone', band });
  }
  return out;
}

// ===== /SECTION: TASTE =====
