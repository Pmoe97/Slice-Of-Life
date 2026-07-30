// ===== SECTION: PROMPT =====
// Tone/content wiring + effect-vocabulary injection for LLM prompts. Split
// out from LLM so prompt *composition* (what goes in, and why) stays
// separate from the call/parse mechanics (LLM section).
//
// Only the 'scene' prompt kind exists in P0 — LLM's buildScenePrompt calls
// the builders below directly rather than a full PROMPT_KINDS/
// assemblePrompt registry, which lands once action_resolve/im/web_content
// prompt kinds actually have something to build (P4/P5).

function resolveContentConfig(contentConfig) {
  return contentConfig || CONTENT_CONFIG;
}

function buildStyleSection(contentConfig) {
  const cfg = resolveContentConfig(contentConfig);
  const profile = TONE_PROFILES[cfg.tone] || TONE_PROFILES.balanced;
  return `STYLE: ${profile.styleDirective}`;
}

function buildContentSection(contentConfig) {
  const flags = resolveContentConfig(contentConfig).contentFlags || CONTENT_CONFIG.contentFlags;
  const lines = Object.entries(CONTENT_DIRECTIVES).map(([key, dir]) => (flags[key] ? dir.on : dir.off));
  return `CONTENT GUIDANCE:\n${lines.map(l => `- ${l}`).join('\n')}`;
}

// The effect vocabulary shown to the LLM for the 'scene' prompt kind — the
// small, safe subset that's actually implemented in P0. Object/item/
// evidence verbs join this list as WORLD/ITEMS/STEALTH land; until then
// they're deliberately absent so the model is never invited to use a verb
// that can't do anything yet (see EFFECTS' `implemented` flag).
const SCENE_EFFECT_VOCAB = ['ADJUST_NEED', 'MOOD_DELTA', 'SPEND_MONEY', 'ADD_SKILL_XP', 'ADD_FLAG', 'MEMORY_FACT', 'NPC_ACTIVITY', 'WITNESS', 'ADJUST_SUSPICION', 'LEAVE_EVIDENCE'];

function buildEffectVocabSection() {
  const lines = SCENE_EFFECT_VOCAB.map(type => `  ${type} ${EFFECT_DEFS[type].paramShape.join(' ')}`);
  return `OPTIONAL WORLD CHANGES (each on its own line inside "effects", exact format, omit anything that doesn't apply):\n${lines.join('\n')}`;
}

// ===== /SECTION: PROMPT =====
