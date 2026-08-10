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
function awardSkillXp(player, skillId, xp, day) {
  player.skills = player.skills || {};
  const before = skillLevel(player, skillId);
  player.skills[skillId] = (player.skills[skillId] || 0) + Number(xp);
  const after = skillLevel(player, skillId);
  if (after > before && player !== undefined) {
    pushMoodImpulse(player, MOOD_PAYOUTS.skillLevelUp * (after - before), day);
  }
  return player.skills[skillId];
}

// 11 entries each, indexed 0..SKILLS.maxLevel. Only `timeReduction` is
// consumed by anything yet (ACTIONS' resolveTimeCost, wired to
// self.cook's `cooking` skill) — the rest (cookQuality, stealthSuccess,
// cleanEfficiency, payMultiplier, socialEdge) are declared now so P4
// (jobs), P6 (stealth), and P7 (autonomy chores) have a stable curve to
// read the moment their systems exist, rather than needing a second pass
// through this file later.
const SKILL_CURVES = {
  timeReduction:   [1.00, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50],
  cookQuality:     [0.30, 0.40, 0.50, 0.60, 0.68, 0.76, 0.82, 0.88, 0.92, 0.96, 1.00],
  cleanEfficiency: [1.00, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50],
  stealthSuccess:  [0.25, 0.34, 0.42, 0.50, 0.57, 0.64, 0.70, 0.76, 0.82, 0.88, 0.94],
  payMultiplier:   [1.00, 1.06, 1.12, 1.20, 1.28, 1.36, 1.44, 1.52, 1.60, 1.70, 1.80],
  socialEdge:      [0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50],
};

function skillMod(player, skillId, curveId) {
  const curve = SKILL_CURVES[curveId];
  if (!curve) { console.warn(`Unknown skill curve: ${curveId}`); return 1; }
  return curve[skillLevel(player, skillId)];
}

// ===== /SECTION: SKILLS =====
