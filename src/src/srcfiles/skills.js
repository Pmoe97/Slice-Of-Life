// ===== SECTION: SKILLS =====
// Progression: level derivation from XP, and the curves that translate a
// level into a concrete outcome modifier (time cost, quality, pay, etc).
// player.skills is already `{}` on every existing save (see sim.js's
// createNpcFromBible-adjacent player init) and skillLevel defaults a
// missing entry to 0, so no migration was needed to add this phase.
//
// One curve, one lookup — skillMod is the only formula. Adding a new
// skill-modified outcome means adding a curve to SKILL_CURVES, not writing
// a new calculation; the curve values themselves are the tuning surface,
// so nothing magic lives outside CONFIG-shaped data.

const SKILLS = { xpPerLevelBase: 40, maxLevel: 10 };

function skillLevel(player, skillId) {
  const xp = (player?.skills && player.skills[skillId]) || 0;
  return Math.min(SKILLS.maxLevel, Math.floor(Math.sqrt(xp / SKILLS.xpPerLevelBase)));
}

// The single site that awards skill XP — ADD_SKILL_XP's applier (EFFECTS)
// and the classes app's attendLesson (COMPUTER) both call here so the
// level-up dopamine rule lives in one place: crossing a level boundary
// pushes a mood impulse (MOOD_PAYOUTS.skillLevelUp × levels crossed). All
// other readers (skillMod etc.) keep reading player.skills directly.
//
// Aspirations & Creative Careers Phase 3 (D8): a level crossed is the first
// Notice & Opinion subject. When the caller passes `gameState` (optional —
// existing callers are unchanged), the crossing goes through NOTICE's
// noticeSubject as a `skill_levelup` in the player's current room, and any
// NPC who actually perceives it (SIGNALS' one query — attention, doors,
// sleep) forms an opinion fact. Callers that pass nothing — the stealth
// award sites, whose whole premise is that nobody saw — stay unnoticed.
function awardSkillXp(player, skillId, xp, day, gameState) {
  player.skills = player.skills || {};
  const before = skillLevel(player, skillId);
  player.skills[skillId] = (player.skills[skillId] || 0) + Number(xp);
  const after = skillLevel(player, skillId);
  if (after > before && player !== undefined) {
    pushMoodImpulse(player, MOOD_PAYOUTS.skillLevelUp * (after - before), day);
    if (gameState && typeof noticeSubject === 'function') {
      noticeSubject(gameState, {
        kind: 'skill_levelup', ref: skillId,
        roomId: gameState.player?.location, day: day ?? gameState.meta?.clock?.day,
        meta: { from: before, to: after },
      });
    }
  }
  return player.skills[skillId];
}

// 11 entries each, indexed 0..SKILLS.maxLevel. Every curve here has a
// real reader (Aspirations & Creative Careers Phase 1, D7 — no field
// without a reader):
//   timeReduction   — ACTIONS' resolveTimeCost (self.cook's `cooking`).
//   craftQuality    — cooking.js's resolveCookStep (`cooking`), and the
//                     quality of every made work from Phase 4 on (a book's
//                     `writing`, a track's `music`, a piece's `art`, D17).
//                     Phase 1 generalised it from its old cooking-specific
//                     name; the values are byte-identical.
//   cleanEfficiency — self.dishes' timeCost curve (`cleaning`).
//   stealthSuccess  — stealth.js / boundary.js / peek.js (`stealth`).
//   socialEdge      — on-camera presence: the appeal multiplier for
//                     skill-agnostic lifestyle Chatter content (D7/D29).
//                     Its reader lands with the platform in Phase 10; it
//                     stays declared so that phase adds a reader, not a
//                     second formula.
// The skill-scaled pay curve was retired in the same phase: gig pay is
// owned by reputation tiers (computer.js's gigPayMult), so it had no
// honest consumer and sat unread for two months.
const SKILL_CURVES = {
  timeReduction:   [1.00, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50],
  craftQuality:    [0.30, 0.40, 0.50, 0.60, 0.68, 0.76, 0.82, 0.88, 0.92, 0.96, 1.00],
  cleanEfficiency: [1.00, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50],
  stealthSuccess:  [0.25, 0.34, 0.42, 0.50, 0.57, 0.64, 0.70, 0.76, 0.82, 0.88, 0.94],
  socialEdge:      [0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50],
};

function skillMod(player, skillId, curveId) {
  const curve = SKILL_CURVES[curveId];
  if (!curve) { console.warn(`Unknown skill curve: ${curveId}`); return 1; }
  return curve[skillLevel(player, skillId)];
}

// ===== /SECTION: SKILLS =====
