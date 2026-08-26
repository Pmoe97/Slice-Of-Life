// ===== SECTION: CONCEPT =====
// The character-concept engine: one typed sentence in, a validated character
// draft out.
//
// AI-Assisted Character Generation plan, Phase 2. See
// src/ref/wip/ai-character-generation-plan.md for the design record.
//
// THE ONE STRUCTURAL RULE (plan design invariant 2): this file never
// constructs a character. It produces a DRAFT — the same shape the manual
// controls read and write — which the surface renders, the player edits, and
// the existing rollCastSlot + validateCharacter path turns into a real NPC.
// The moment a second construction path exists the two drift, and the AI path
// becomes the one that quietly produces invalid characters nobody notices
// until a save fails to load.
//
// Everything here is pure except fillFromConcept, which is the only function
// that touches root.generateText. That split is what makes the interesting
// half — the normalizer, the parser and the adapters — directly testable in
// the vm harness against canned responses (dev/verify/verify-concept-p2.js).
//
// WHY THE PROMPT DOES NOT CONTAIN THE POOLS (plan D3). The path this replaces,
// buildAIGenerationPrompt, inlined QUIRKS_POOL/LIKES_POOL/DISLIKES_POOL/
// PERSONALITY_TRAITS_POOL verbatim — several thousand characters of prompt —
// and then hard-filtered the reply with `POOL.includes(x)`, so "sardonic" was
// discarded because the pool says "sarcastic". That is the worst of both: a
// huge prompt AND a lossy read. Since validateNpcScalar gates vocabulary only
// where CHARACTER_SCHEMA declares an `enum` (plan D1), none of those fields
// needed a pool in the first place. This prompt names the SHAPE of each field
// with an illustrative example or two, and the reply is coerced by type and
// range alone.

// The description box's cap. Long enough for a paragraph of character notes,
// short enough that nobody pastes a novel into an LLM call by accident.
const CONCEPT_MAX_DESCRIPTION = 600;

const CONCEPT_TEMPERAMENT_AXES = [
  'warmth', 'volatility', 'openness', 'conscientiousness', 'assertiveness', 'selfAwareness',
];

// Physical subtrees the fill deliberately does not ask for, each for its own
// reason. Skipping here rather than in the normalizer means the prompt and the
// reader can never disagree about what is in scope.
//
// - heightBuild: a CACHED join of height + build. applyAuthoredPhysical
//   recomputes it, so a generated one would be overwritten at best and
//   contradict its own parts at worst.
// - typicalAttire: reserved with no reader (config.js says so in as many
//   words). Writing it would be the stressProfile mistake — plan invariant 3.
// - intimate: derived from `gender` by generateIntimate and authored by the
//   player on the studio's Intimate tab. A description almost never specifies
//   it, and asking a model for it unprompted is not something the fill should
//   do on its own initiative. Parked as an open question in the plan, not a
//   permanent exclusion.
const CONCEPT_PHYSICAL_SKIP = new Set(['heightBuild', 'typicalAttire', 'intimate']);

// The two physical arrays that hold ROW OBJECTS rather than strings, with the
// keys each row carries. They need explicit handling because
// CHARACTER_SCHEMA declares them as bare `{ type: 'array' }` with no
// itemFields — which means validateNpcScalar's array branch requires every
// element to be a STRING and would reject the very row objects the studio
// itself stores there. The schema is loose here and the studio is the real
// contract; caps match STUDIO_ROW_GROUPS' own `max`.
const CONCEPT_PHYSICAL_ROWS = {
  piercings: { keys: ['location', 'type', 'description'], max: 6 },
  tattoos:   { keys: ['location', 'style', 'description'], max: 6 },
};
const CONCEPT_FEATURES_MAX = 4;   // STUDIO_ROW_GROUPS / PLAYER_STUDIO_TABS 'toggles' max

// Illustrative values for the handful of physical fields where the expected
// FORM is not obvious from the field name alone. Hand-written and deliberately
// off-pool: these teach the model the register ("a phrase, not a word") — they
// are not a vocabulary, and nothing validates against them, so they cannot
// drift out of sync with anything. Every other field gets its name and no
// example, which is enough.
const CONCEPT_PHYSICAL_HINTS = {
  'height': 'tall',
  'build': 'wiry',
  'hair.color': 'dyed lavender, badly grown out',
  'hair.style': 'shaved at one side',
  'eyes.color': 'pale grey-green',
  'skin.ethnicity': 'a heritage, e.g. Mediterranean',
  'face.shape': 'narrow',
  'fashion': 'thrifted menswear two sizes too big',
  'accessories': 'a dead watch he never winds',
  'voice.accent': 'flattened Boston, mostly worn off',
  'gait': 'walks like he is late',
  'scent': 'cheap cigarettes and clean laundry',
  'facialHair': 'three days of stubble',
};

// --- Scopes (plan D5) ---
// `fields` is the ordered list of top-level draft keys the prompt asks for and
// the normalizer accepts. Anything outside it is dropped before validation, so
// widening a scope is a one-line edit in exactly one place.
const CONCEPT_NPC_FIELDS = [
  'name', 'surname', 'age', 'gender', 'species', 'occupation',
  'temperament', 'personality', 'speech', 'interests', 'values',
  'baggage', 'wound', 'want', 'blindSpot', 'boundary',
  'physical', 'history', 'sketch', 'sampleLines',
];

const CONCEPT_SCOPES = {
  player: {
    fields: ['name', 'surname', 'age', 'gender', 'physical', 'portraitPrompt'],
    subject: 'the player character',
    // The player is the person the human is going to BE. Their inner life is
    // the player's to play, not the model's to assign, so this scope asks for
    // identity and appearance and stops there — no temperament, no wound, no
    // sample lines.
    note: 'This is the character the player will control. Give them a look and a name, not a personality — the player supplies that themselves.',
  },
  npcAppearance: {
    fields: ['physical'],
    subject: 'this character',
    note: 'Only their appearance is being designed here. Do not invent a name, an age, or a personality.',
  },
  npcFull: {
    fields: CONCEPT_NPC_FIELDS,
    subject: 'a new character',
    note: 'A full character sheet for someone who will live in a shared apartment with the player.',
  },
  npcRewrite: {
    fields: CONCEPT_NPC_FIELDS,
    subject: 'an existing character',
    note: 'You are REWRITING someone who already exists. Their history with the player is preserved separately and must not be contradicted — write who they are now, not how they met anyone.',
  },
};

// --- Prompt ---

// The physical block, generated from CHARACTER_SCHEMA rather than hand-listed,
// so a field added to the schema is asked for automatically. The alternative —
// a hand-maintained list here — is precisely the failure that let four
// lifestyle dimensions sit unread on every occupation entry for weeks
// (rollCastSlot's own denylist comment tells that story).
function conceptPhysicalSkeleton() {
  const root = (typeof CHARACTER_SCHEMA !== 'undefined' && CHARACTER_SCHEMA.bible.physical) || null;
  if (!root || !root.fields) return '';
  const walk = (fields, prefix) => {
    const parts = [];
    for (const [key, spec] of Object.entries(fields)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (!prefix && CONCEPT_PHYSICAL_SKIP.has(key)) continue;
      if (spec.type === 'object' && spec.fields) {
        const inner = walk(spec.fields, path);
        if (inner) parts.push(`"${key}": { ${inner} }`);
      } else if (spec.type === 'array') {
        if (key === 'distinguishingFeatures') {
          parts.push(`"${key}": ["up to ${CONCEPT_FEATURES_MAX} specific visible details — scars, freckles, a chipped tooth"]`);
        } else if (CONCEPT_PHYSICAL_ROWS[key]) {
          const shape = CONCEPT_PHYSICAL_ROWS[key].keys.map(k => `"${k}": "…"`).join(', ');
          parts.push(`"${key}": [{ ${shape} }]`);
        }
      } else {
        const hint = CONCEPT_PHYSICAL_HINTS[path];
        parts.push(`"${key}": "${hint || '…'}"`);
      }
    }
    return parts.join(', ');
  };
  return walk(root.fields, '');
}

// What the draft already holds, so a fill on a half-filled form is told what
// to stay consistent with instead of contradicting the player's own choices.
// Only scalars are worth showing — a nested appearance dump would cost more
// prompt than it earns.
function conceptContextBlock(context) {
  const ctx = context || {};
  const lines = [];
  const authored = ctx.authored || {};
  for (const [key, val] of Object.entries(authored)) {
    if (val === undefined || val === null || val === '') continue;
    if (typeof val === 'object') continue;
    lines.push(`- ${key}: ${String(val).slice(0, 120)}`);
  }
  let out = '';
  if (lines.length > 0) {
    out += `\nALREADY CHOSEN BY THE PLAYER — keep these exactly, and make everything else consistent with them:\n${lines.join('\n')}\n`;
  }
  if (ctx.existingName) {
    out += `\nThis character is currently called ${ctx.existingName}. Keep that name unless the description clearly asks for a different one.\n`;
  }
  if (Array.isArray(ctx.usedNames) && ctx.usedNames.length > 0) {
    out += `\nNames already used in this household — do NOT reuse any of them: ${ctx.usedNames.slice(0, 12).join(', ')}.\n`;
  }
  return out;
}

function buildConceptPrompt(description, scope, context) {
  const s = CONCEPT_SCOPES[scope] || CONCEPT_SCOPES.npcFull;
  const want = new Set(s.fields);
  const genderEnum = (CHARACTER_SCHEMA.bible.gender.enum || []).join(', ');
  const speciesEnum = (CHARACTER_SCHEMA.bible.species.enum || []).join(', ');

  const blocks = [];
  if (want.has('name')) {
    blocks.push(`  "name": "a first name that fits them"${want.has('surname') ? ',\n  "surname": "a surname that fits them"' : ''}`);
  }
  if (want.has('age')) blocks.push(`  "age": 18-60, a whole number`);
  if (want.has('gender')) blocks.push(`  "gender": one of: ${genderEnum}`);
  if (want.has('species')) blocks.push(`  "species": one of: ${speciesEnum} — use "human" unless the description clearly asks otherwise`);
  if (want.has('occupation')) {
    blocks.push(`  "occupation": {
    "title": "what they actually do — any real job, not from a list",
    "category": "one broad word for the field, e.g. food, tech, health, arts, trades",
    "incomeBand": one of: low, mid, high,
    "hours": "e.g. nights, early mornings, irregular, 9-5",
    "workMode": one of: on_site, hybrid, remote, self_employed, none
  }`);
  }
  if (want.has('temperament')) {
    blocks.push(`  "temperament": { ${CONCEPT_TEMPERAMENT_AXES.map(a => `"${a}": -1.0 to 1.0`).join(', ')} }`);
  }
  if (want.has('personality')) {
    blocks.push(`  "personality": {
    "traits": ["3-5 single words"],
    "coreTrait": "the one everyone notices",
    "hiddenTrait": "the one they suppress — NOT in traits",
    "quirks": ["2-4 specific habits, written as short sentences, e.g. 'apologises to furniture she bumps into'"],
    "likes": ["3-5 concrete things, e.g. 'the smell of a laundromat'"],
    "dislikes": ["3-5 concrete things"]
  }`);
  }
  if (want.has('speech')) {
    blocks.push(`  "speech": {
    "verbosity": 0.0-1.0, "formality": 0.0-1.0, "profanityLevel": 0.0-1.0, "vocabularyLevel": 0.0-1.0,
    "humorStyle": "e.g. dry, warm, cruel, none",
    "textingStyle": "e.g. lowercase no punctuation, formal, voice notes only",
    "verbalTics": ["1-2 things they actually say"],
    "catchphrases": ["0-2, only if they'd really have one"]
  }`);
  }
  if (want.has('interests')) blocks.push(`  "interests": ["2-3 things they spend time on"]`);
  if (want.has('values')) {
    blocks.push(`  "values": [{ "name": "what they hold to", "opposition": "the value it costs them" }] — exactly 2`);
  }
  if (want.has('baggage')) {
    blocks.push(`  "baggage": "1-2 sentences about what they carry from before",
  "wound": "one sentence — the thing that actually hurt them",
  "want": "one sentence — what they are chasing now",
  "blindSpot": "one sentence — what they believe about themselves that isn't true",
  "boundary": "one sentence — a line they enforce"`);
  }
  if (want.has('physical')) {
    const skel = conceptPhysicalSkeleton();
    blocks.push(`  "physical": { ${skel} }`);
  }
  if (want.has('history')) {
    blocks.push(`  "history": "one paragraph, 3-5 sentences, on how they ended up in this apartment",
  "sketch": "one line capturing them, max 120 characters",
  "sampleLines": ["3-5 lines of dialogue in their actual voice"]`);
  }
  if (want.has('portraitPrompt')) {
    blocks.push(`  "portraitPrompt": "a single comma-separated image-generation prompt describing their face and upper body, consistent with the physical fields above"`);
  }

  return `You are designing ${s.subject} for a grounded slice-of-life apartment simulation. The player has described who they want. Turn that description into a complete, coherent person.

${s.note}

THE PLAYER'S DESCRIPTION:
"""
${description}
"""
${conceptContextBlock(context)}
HOW TO WRITE THIS:
- Everything must serve the description. If they asked for a shy barista, every field should be recognisably that person.
- Write in your OWN words. There is no list to pick from — specific and particular beats generic every time. "collects other people's discarded houseplants" is a character; "gardening" is a category.
- Physical fields are short phrases, not sentences — they get joined into a description, so "dyed lavender, badly grown out" works and "Her hair is dyed lavender." does not.
- Fill in what the description leaves out, consistently. Do not leave fields blank.
- Adults only: every character is 18 or older.

Respond with ONE JSON object and nothing else — no markdown, no commentary, no code fences.

{
${blocks.join(',\n')}
}`;
}

// --- Parsing ---
// Deliberately tolerant. A refusal to parse costs the player their whole
// description, so this tries the cheap repairs before giving up — but it never
// GUESSES at content, only at punctuation.

// Bug fix (2026-08-27, live playtest): `fillFromConcept` calls
// root.generateText with `startWith: '{'`, and every OTHER structured call
// in this codebase (llm.js's expandCharacterProse etc.) assumes the returned
// text already carries that seed character — none of them re-prepend it.
// That assumption holds for a clean stream, but a live log caught the plugin
// hitting a mid-stream "stream error: unknown_error" and recovering via its
// own "Attempting continuation" path, and the text that recovery handed back
// was missing the seed `{` entirely: it started `  "name": "Parker", ...`,
// a bare object body with no wrapper.
//
// Without this, `indexOf('{')` below finds the WRONG brace — the first one
// appearing anywhere in the text, which for a physical-heavy character is the
// nested `"physical": {` — and slices from there, discarding name/surname/
// age/gender and every field before it. A response that was otherwise
// perfectly complete and valid (confirmed: it round-trips through a plain
// `JSON.parse` once its own seed is restored) was thrown away and retried,
// which is most of what turned "generate a character" into "roll the dice on
// whether tonight's stream hiccups".
//
// The fix is narrow on purpose: only a bare object BODY — text beginning
// immediately with `"key":` — gets the brace restored. Prose commentary
// before a real `{` (the "Sure! Here you go:" case, already handled below by
// indexOf) must NOT trigger this, or prepending `{` ahead of it would bury
// the real opening brace under a fake one.
function parseConceptResponse(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  if (!s) return null;

  // Strip a markdown fence even though the prompt forbids one — models emit
  // them anyway, and losing a whole character to three backticks is absurd.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  if (/^"[^"\\]*(?:\\.[^"\\]*)*"\s*:/.test(s)) s = '{' + s;

  const start = s.indexOf('{');
  if (start < 0) return null;
  const end = s.lastIndexOf('}');
  const body = end > start ? s.slice(start, end + 1) : s.slice(start);

  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    const repaired = conceptRepairJson(body);
    if (!repaired) return null;
    try {
      const parsed = JSON.parse(repaired);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (e2) {
      return null;
    }
  }
}

// One repair pass for the single failure that actually happens: the reply was
// cut off mid-object. Walk the text tracking string state and nesting, drop
// whatever trails the last COMPLETE key/value pair, and close the structures
// still open. Everything recovered this way is content the model really sent;
// the truncated tail is discarded rather than invented.
//
// This is why fillFromConcept passes no `stopSequences`. The path this
// replaces used `['}\n']`, which ends generation at the first `}` followed by
// a newline — exactly what a pretty-printed nested "physical" block produces
// partway through the reply.
function conceptRepairJson(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  let lastSafe = -1;   // index just past the last complete pair at depth >= 1

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{' || c === '[') { stack.push(c === '{' ? '}' : ']'); continue; }
    if (c === '}' || c === ']') {
      stack.pop();
      if (stack.length >= 1) lastSafe = i + 1;
      continue;
    }
    if (c === ',' && stack.length >= 1) lastSafe = i;
  }

  if (stack.length === 0) return null;   // balanced already; the fault is elsewhere
  if (lastSafe < 0) return null;         // nothing complete to keep

  let out = text.slice(0, lastSafe).replace(/,\s*$/, '');
  // Reconstruct the closers for whatever is still open. The stack was built
  // across the WHOLE string, so recount against the kept prefix only.
  const depth = [];
  inString = false; escaped = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth.push('}');
    else if (c === '[') depth.push(']');
    else if (c === '}' || c === ']') depth.pop();
  }
  while (depth.length > 0) out += depth.pop();
  return out;
}

// --- Normalizing ---
// THE validation boundary. Every value the model produced is coerced by its
// CHARACTER_SCHEMA spec and dropped if it cannot be made legal — field by
// field, never all-or-nothing. A reply with one bad age and one hallucinated
// gender still yields a usable character; that is the whole point, since a
// rejected fill costs the player their description.

function conceptCleanString(v, maxLength) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return maxLength ? s.slice(0, maxLength) : s;
}

function conceptCleanStringArray(v, maxItems, maxLength) {
  if (!Array.isArray(v)) return undefined;
  const out = [];
  const seen = new Set();
  for (const item of v) {
    const s = conceptCleanString(typeof item === 'object' && item ? item.name : item, maxLength || 200);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (maxItems && out.length >= maxItems) break;
  }
  return out.length > 0 ? out : undefined;
}

function conceptCleanNumber(v, lo, hi, round) {
  let n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  // Out-of-range CLAMPS rather than drops. The schema range is the game's
  // rule, not the model's error: an age of 12 for a character described as
  // young is a near-miss worth keeping at the floor, and every manual numeric
  // path in the game already clamps the same way (menu.js's roommate age,
  // studio.js's validateStudioField).
  if (typeof lo === 'number') n = Math.max(lo, n);
  if (typeof hi === 'number') n = Math.min(hi, n);
  return round ? Math.round(n) : Math.round(n * 1000) / 1000;
}

// Recursive walk of a schema object node. Leaves go through the REAL
// validateNpcField, so this surface can never accept a value the Character
// Studio's own editor would reject.
function conceptNormalizeSchemaNode(spec, value, schemaPath, touchedPath, touched) {
  if (value === undefined || value === null || !spec) return undefined;

  if (spec.type === 'object' && spec.fields) {
    if (typeof value !== 'object' || Array.isArray(value)) return undefined;
    const out = {};
    let any = false;
    for (const [k, sub] of Object.entries(spec.fields)) {
      const v = conceptNormalizeSchemaNode(sub, value[k], `${schemaPath}.${k}`, `${touchedPath}.${k}`, touched);
      if (v !== undefined) { out[k] = v; any = true; }
    }
    return any ? out : undefined;
  }

  let v;
  if (spec.type === 'number') {
    v = conceptCleanNumber(value, spec.range ? spec.range[0] : undefined, spec.range ? spec.range[1] : undefined);
  } else if (spec.type === 'string') {
    v = conceptCleanString(value, spec.maxLength);
    if (v !== undefined && Array.isArray(spec.enum) && !spec.enum.includes(v)) return undefined;
  } else if (spec.type === 'array') {
    v = conceptCleanStringArray(value, spec.maxItems, 200);
  } else if (spec.type === 'boolean') {
    v = typeof value === 'boolean' ? value : undefined;
  }
  if (v === undefined) return undefined;

  const r = validateNpcField(schemaPath, v);
  if (!r.ok) return undefined;
  touched.push(touchedPath);
  return r.value;
}

// The appearance subtree. Not a plain schema walk, because two of its arrays
// hold row OBJECTS the schema describes only as bare arrays (see
// CONCEPT_PHYSICAL_ROWS) and one array has a studio-imposed cap the schema
// does not carry.
function conceptNormalizePhysical(value, touched) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const spec = CHARACTER_SCHEMA.bible.physical;
  const out = {};
  let any = false;

  for (const [key, sub] of Object.entries(spec.fields)) {
    if (CONCEPT_PHYSICAL_SKIP.has(key)) continue;
    const raw = value[key];
    if (raw === undefined || raw === null) continue;

    if (key === 'distinguishingFeatures') {
      const list = conceptCleanStringArray(raw, CONCEPT_FEATURES_MAX, 200);
      if (list) { out[key] = list; touched.push(`physical.${key}`); any = true; }
      continue;
    }
    if (CONCEPT_PHYSICAL_ROWS[key]) {
      const shape = CONCEPT_PHYSICAL_ROWS[key];
      if (!Array.isArray(raw)) continue;
      const rows = [];
      for (const row of raw) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const built = {};
        for (const k of shape.keys) {
          const s = conceptCleanString(row[k], k === 'description' ? 200 : 80);
          if (s) built[k] = s;
        }
        // A row with only a description names nothing; drop it.
        if (Object.keys(built).some(k => k !== 'description')) rows.push(built);
        if (rows.length >= shape.max) break;
      }
      if (rows.length > 0) { out[key] = rows; touched.push(`physical.${key}`); any = true; }
      continue;
    }

    const v = conceptNormalizeSchemaNode(sub, raw, `bible.physical.${key}`, `physical.${key}`, touched);
    if (v !== undefined) { out[key] = v; any = true; }
  }

  return any ? out : undefined;
}

// The occupation record the model proposed. Kept as HINTS rather than resolved
// here: resolveAuthoredOccupationPool (sim.js) does the resolving at roll
// time, where it can also keep the rng draw shape intact. All this does is
// decide which of the model's suggestions are sane enough to pass along.
const CONCEPT_INCOME_BANDS = ['low', 'mid', 'high'];
const CONCEPT_WORK_MODES = ['on_site', 'hybrid', 'remote', 'self_employed', 'none'];
const CONCEPT_INCOME_SOURCES = ['wage', 'salary', 'freelance', 'benefits', 'savings', 'support'];

function conceptNormalizeOccupation(value, touched) {
  if (!value) return undefined;
  const raw = typeof value === 'string' ? { title: value } : value;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const out = {};
  const title = conceptCleanString(raw.title, 80);
  const category = conceptCleanString(raw.category, 40);
  if (title) out.title = title;
  if (category) out.category = category;
  if (!title && !category) return undefined;

  const band = conceptCleanString(raw.incomeBand, 20);
  if (band && CONCEPT_INCOME_BANDS.includes(band.toLowerCase())) out.incomeBand = band.toLowerCase();
  const hours = conceptCleanString(raw.hours, 60);
  if (hours) out.hours = hours;
  const mode = conceptCleanString(raw.workMode, 20);
  if (mode && CONCEPT_WORK_MODES.includes(mode.toLowerCase())) out.workMode = mode.toLowerCase();
  const src = conceptCleanString(raw.incomeSource, 20);
  if (src && CONCEPT_INCOME_SOURCES.includes(src.toLowerCase())) out.incomeSource = src.toLowerCase();

  touched.push('occupation');
  return out;
}

function conceptNormalizeTemperament(value, touched) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  let any = false;
  for (const axis of CONCEPT_TEMPERAMENT_AXES) {
    const n = conceptCleanNumber(value[axis], -1, 1);
    if (n === undefined) continue;
    out[axis] = n;
    touched.push(`temperament.${axis}`);
    any = true;
  }
  return any ? out : undefined;
}

function conceptNormalizePersonality(value, touched) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  let any = false;
  const arrays = { traits: [5, 40], quirks: [4, 200], likes: [5, 120], dislikes: [5, 120] };
  for (const [key, [maxItems, maxLen]] of Object.entries(arrays)) {
    const list = conceptCleanStringArray(value[key], maxItems, maxLen);
    if (list) { out[key] = list; touched.push(`personality.${key}`); any = true; }
  }
  for (const key of ['coreTrait', 'hiddenTrait']) {
    const s = conceptCleanString(value[key], 40);
    if (s) { out[key] = s; touched.push(`personality.${key}`); any = true; }
  }
  // The hidden trait is defined by NOT being one of the visible ones — and the
  // core trait is the MOST visible one, so it counts too. Checked against both
  // independently: an earlier version guarded on `traits` being an array, so a
  // reply whose traits were dropped as the wrong type sailed straight past
  // with hiddenTrait === coreTrait, which is a character whose "suppressed"
  // trait is the one everybody notices first.
  if (out.hiddenTrait) {
    const hidden = out.hiddenTrait.toLowerCase();
    const visible = (Array.isArray(out.traits) ? out.traits : []).map(t => t.toLowerCase());
    if (out.coreTrait) visible.push(out.coreTrait.toLowerCase());
    if (visible.includes(hidden)) delete out.hiddenTrait;
  }
  return any ? out : undefined;
}

function conceptNormalizeSpeech(value, touched) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  let any = false;
  for (const key of ['verbosity', 'formality', 'profanityLevel', 'vocabularyLevel']) {
    const n = conceptCleanNumber(value[key], 0, 1);
    if (n === undefined) continue;
    out[key] = n; touched.push(`speech.${key}`); any = true;
  }
  for (const key of ['humorStyle', 'textingStyle']) {
    const s = conceptCleanString(value[key], 40);
    if (s) { out[key] = s; touched.push(`speech.${key}`); any = true; }
  }
  for (const [key, cap] of [['verbalTics', 3], ['catchphrases', 3]]) {
    const list = conceptCleanStringArray(value[key], cap, 80);
    if (list) { out[key] = list; touched.push(`speech.${key}`); any = true; }
  }
  return any ? out : undefined;
}

function conceptNormalizeInterests(value, touched) {
  const names = conceptCleanStringArray(value, 3, 60);
  if (!names) return undefined;
  // resolveAuthoredInterests (sim.js) is D4's resolver — an off-pool name
  // keeps its text and borrows the nearest pool entry's tags. Called here so
  // the DRAFT already carries the tags a surface might want to show, and
  // called again at roll time, which is idempotent.
  const resolved = resolveAuthoredInterests(names);
  if (!resolved.length) return undefined;
  touched.push('interests');
  return resolved.map(i => ({ name: i.name, tags: i.tags || [], skill: 0 }));
}

function conceptNormalizeValues(value, touched) {
  if (!Array.isArray(value)) return undefined;
  // Objects are passed through rather than flattened first, so the model's own
  // `opposition` reaches resolveAuthoredValues and wins over the derived one.
  const rows = [];
  for (const item of value) {
    if (typeof item === 'string') { rows.push(item.trim()); continue; }
    if (item && typeof item === 'object' && item.name) {
      rows.push({ name: String(item.name).trim(), opposition: item.opposition ? String(item.opposition).trim() : '' });
    }
    if (rows.length >= 2) break;
  }
  if (rows.length === 0) return undefined;
  const resolved = resolveAuthoredValues(rows);
  if (!resolved.length) return undefined;
  touched.push('values');
  return resolved.map(v => ({ name: v.name, opposition: v.opposition || '' }));
}

function normalizeConceptDraft(parsed, scope) {
  const draft = { _touched: [] };
  const s = CONCEPT_SCOPES[scope];
  if (!s || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return draft;
  const t = draft._touched;
  const want = new Set(s.fields);
  const put = (key, val, touchPath) => {
    if (val === undefined) return;
    draft[key] = val;
    if (touchPath) t.push(touchPath);
  };

  if (want.has('name')) put('name', conceptCleanString(parsed.name, 60), 'name');
  if (want.has('surname')) put('surname', conceptCleanString(parsed.surname, 60), 'surname');
  if (want.has('age')) put('age', conceptCleanNumber(parsed.age, 18, 60, true), 'age');

  for (const key of ['gender', 'species']) {
    if (!want.has(key)) continue;
    const v = conceptNormalizeSchemaNode(CHARACTER_SCHEMA.bible[key], parsed[key], `bible.${key}`, key, t);
    if (v !== undefined) draft[key] = v;
  }

  if (want.has('occupation')) put('occupation', conceptNormalizeOccupation(parsed.occupation, t));
  if (want.has('temperament')) put('temperament', conceptNormalizeTemperament(parsed.temperament, t));
  if (want.has('personality')) put('personality', conceptNormalizePersonality(parsed.personality, t));
  if (want.has('speech')) put('speech', conceptNormalizeSpeech(parsed.speech, t));
  if (want.has('interests')) put('interests', conceptNormalizeInterests(parsed.interests, t));
  if (want.has('values')) put('values', conceptNormalizeValues(parsed.values, t));

  for (const key of ['baggage', 'wound', 'want', 'blindSpot', 'boundary']) {
    if (!want.has(key)) continue;
    const v = conceptNormalizeSchemaNode(CHARACTER_SCHEMA.bible[key], parsed[key], `bible.${key}`, key, t);
    if (v !== undefined) draft[key] = v;
  }

  if (want.has('physical')) put('physical', conceptNormalizePhysical(parsed.physical, t));

  for (const key of ['history', 'sketch']) {
    if (!want.has(key)) continue;
    const v = conceptNormalizeSchemaNode(CHARACTER_SCHEMA.bible[key], parsed[key], `bible.${key}`, key, t);
    if (v !== undefined) draft[key] = v;
  }
  if (want.has('sampleLines')) {
    const v = conceptCleanStringArray(parsed.sampleLines, 5, 200);
    if (v !== undefined) put('sampleLines', v, 'sampleLines');
  }
  // Not a bible field — the studio's own portrait record holds it, so there is
  // no schema path to validate against.
  if (want.has('portraitPrompt')) put('portraitPrompt', conceptCleanString(parsed.portraitPrompt, 400), 'portraitPrompt');

  return draft;
}

// --- authoredFields (plan D9) ---
// _touched collapsed to the PREFIX form mergeProseIntoBible matches on, so the
// output is shaped exactly like roommateAuthoredFields': 'physical', not forty
// 'physical.*' entries. Only prefixes the lock actually understands are
// emitted — 'occupation' covers the whole occupation object, and a bare
// 'temperament' covers every axis.
const CONCEPT_AUTHORED_PREFIXES = [
  'physical', 'temperament', 'personality', 'speech', 'occupation', 'interests', 'values',
];

function conceptTouchedFields(draft) {
  const touched = (draft && draft._touched) || [];
  const out = [];
  const seen = new Set();
  for (const path of touched) {
    const prefix = CONCEPT_AUTHORED_PREFIXES.find(p => path === p || path.startsWith(p + '.'));
    const key = prefix || path;
    // portraitPrompt is studio-local and has no bible counterpart, so it must
    // never appear in a bible's authoredFields (plan invariant 4's spirit).
    if (key === 'portraitPrompt') continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

// Did this fill write the prose the start-of-game expansion would otherwise
// produce? If so the caller skips that call entirely (D9) — one AI call at
// fill time REPLACES one at start time rather than adding to it.
function conceptWroteProse(draft) {
  if (!draft) return false;
  return !!(draft.history || draft.sketch || (Array.isArray(draft.sampleLines) && draft.sampleLines.length > 0));
}

// --- Adapters ---
// Each strips `_touched` explicitly rather than trusting validateCharacter to
// drop unknown keys (plan design invariant 4 — the castWeb scar).

// → the rollCastSlot / sandbox-roommate partial.
// interests and values flatten to NAME STRINGS here on purpose: that is what
// the sandbox's own controls read and write (sbxWriteMultiSelect), and an
// object in that slot renders as "[object Object]". The opposition hint the
// draft carries is not lost — resolveAuthoredValues re-derives an equivalent
// one at roll time.
function conceptToPartial(draft) {
  if (!draft) return {};
  const p = {};
  for (const key of ['name', 'surname', 'age', 'gender', 'species', 'baggage', 'wound', 'want', 'blindSpot', 'boundary']) {
    if (draft[key] !== undefined) p[key] = draft[key];
  }
  if (draft.temperament) p.temperament = { ...draft.temperament };
  if (draft.physical) p.physical = JSON.parse(JSON.stringify(draft.physical));
  // Phase 5: rollCastSlot now honours these too — before, personality/speech
  // were patched on post-roll by buildStudioNpc (so only the one surface that
  // remembered got them) and prose was hardcoded empty for the prose pass to
  // fill (so a concept fill's history could not reach a sandbox game at all).
  if (draft.personality) p.personality = { ...draft.personality };
  if (draft.speech) p.speech = { ...draft.speech };
  for (const key of ['history', 'sketch']) if (draft[key] !== undefined) p[key] = draft[key];
  if (Array.isArray(draft.sampleLines) && draft.sampleLines.length > 0) p.sampleLines = [...draft.sampleLines];
  if (Array.isArray(draft.interests) && draft.interests.length) p.interests = draft.interests.map(i => i.name);
  if (Array.isArray(draft.values) && draft.values.length) p.values = draft.values.map(v => v.name);
  if (draft.occupation) {
    p.occupationCategory = draft.occupation.title || draft.occupation.category;
    const overrides = {};
    for (const k of ['incomeBand', 'hours', 'workMode', 'incomeSource']) {
      if (draft.occupation[k]) overrides[k] = draft.occupation[k];
    }
    if (Object.keys(overrides).length > 0) p.occupationOverrides = overrides;
  }
  return p;
}

// → the in-game Character Studio's draft (buildStudioNpc's input shape), which
// is the partial plus the three groups rollCastSlot cannot take as partial
// keys and patches on afterwards.
// Since Phase 5 the partial carries personality, speech and prose too, so the
// two shapes have converged and this is a straight alias. Kept as its own
// named function rather than collapsed into one: the two have different
// CONSUMERS (rollCastSlot's partial vs buildStudioNpc's draft), and if either
// grows a key the other must not have, the seam to split them is already here.
function conceptToStudioDraft(draft) {
  return conceptToPartial(draft);
}

// → a {path, value} edit list for an EXISTING npc (Phase 6, D13). Every entry
// is a real CHARACTER_SCHEMA path, so the caller can run it through the same
// validateNpcField → applyNpcField → bibleChanges loop the manual editor uses
// and cannot write anything the manual editor could not.
//
// `npc` is read only to skip no-op writes, which keeps the diff preview and
// the revision log honest about what actually changed.
function conceptToEditList(draft, npc) {
  if (!draft) return [];
  const edits = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // A local dotted reader rather than render.computer.js's studioGetPath.
  // That function is equivalent, but it lives in the UI layer BELOW this file
  // in load order, so depending on it would make this adapter behave
  // differently in the vm harness than in the browser — the kind of split
  // that makes a test pass while the real thing is broken. No `[n]` handling
  // is needed: every path this builds addresses a whole array, never an
  // element.
  const cur = (path) => {
    if (!npc) return undefined;
    let node = npc;
    for (const seg of String(path).split('.')) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[seg];
    }
    return node;
  };
  const push = (path, value) => {
    if (value === undefined) return;
    if (npc && same(cur(path), value)) return;
    edits.push({ path, value });
  };

  for (const key of ['name', 'surname', 'age', 'gender', 'species', 'baggage', 'wound', 'want', 'blindSpot', 'boundary', 'history', 'sketch']) {
    push(`bible.${key}`, draft[key]);
  }
  if (Array.isArray(draft.sampleLines)) push('bible.sampleLines', draft.sampleLines);
  if (draft.temperament) for (const [k, v] of Object.entries(draft.temperament)) push(`bible.temperament.${k}`, v);
  if (draft.personality) for (const [k, v] of Object.entries(draft.personality)) push(`bible.personality.${k}`, v);
  if (draft.speech) for (const [k, v] of Object.entries(draft.speech)) push(`bible.speech.${k}`, v);
  if (Array.isArray(draft.interests)) push('bible.interests', draft.interests);
  if (Array.isArray(draft.values)) push('bible.values', draft.values);
  // Occupation writes only the fields the model actually proposed;
  // scheduleTemplate is never among them (D2b — a novel key breaks scheduling
  // with no visible error).
  if (draft.occupation) {
    for (const k of ['title', 'category', 'incomeBand', 'hours', 'workMode', 'incomeSource']) {
      push(`bible.occupation.${k}`, draft.occupation[k]);
    }
  }
  if (draft.physical) {
    const walk = (obj, prefix) => {
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${prefix}.${k}`);
        else push(`${prefix}.${k}`, v);
      }
    };
    walk(draft.physical, 'bible.physical');
  }
  return edits;
}

// Does an edit list touch appearance? Phase 6's D14 bumps genSeed — the image
// cache key — only when it does, so a personality-only rewrite keeps its
// portrait and an appearance rewrite stops showing the old face.
function conceptEditsTouchAppearance(edits) {
  return (edits || []).some(e => String(e.path || '').startsWith('bible.physical'));
}

// --- The one impure function ---
async function fillFromConcept(description, scope, context) {
  const desc = String(description == null ? '' : description).trim().slice(0, CONCEPT_MAX_DESCRIPTION);
  if (!desc) return { ok: false, reason: 'Describe the character first.' };
  if (!CONCEPT_SCOPES[scope]) return { ok: false, reason: `Unknown concept scope: ${scope}` };

  const instruction = buildConceptPrompt(desc, scope, context);
  try {
    // NO stopSequences — see conceptRepairJson's comment. `startWith: '{'`
    // matches every other structured call in the game (llm.js).
    const run = async () => parseConceptResponse(await root.generateText({ instruction, startWith: '{' }));
    // Two retries (three attempts total), not the one every other structured
    // call in this codebase uses (callAssessor/callChronicler). Bug fix
    // (2026-08-27): a live playtest hit 6 straight failures, and a captured
    // log showed why a single retry is thinner cover HERE than it is for
    // those — this prompt's payload (name/appearance/personality/speech/
    // narrative/full physical, all at once) is far larger, which means far
    // more time mid-stream for the plugin's own "stream error, attempting
    // continuation" recovery path to fire — and THAT path is what was
    // dropping content (parseConceptResponse's fix above recovers a dropped
    // seed brace; it cannot recover an outright missing name/surname). This
    // call is also user-initiated and waited-on, not an ambient background
    // judgment, so the extra latency on the rare double-failure costs a
    // second or two of "still generating" — worth it against a failed
    // character.
    let parsed = await run();
    for (let attempt = 1; !parsed && attempt <= 2; attempt++) {
      console.warn(`Concept reply unparseable; retrying (${attempt}/2)`);
      parsed = await run();
    }
    if (!parsed) {
      return { ok: false, reason: 'That came back unreadable after a few tries. Try again, or give a little more detail.' };
    }
    const draft = normalizeConceptDraft(parsed, scope);
    if (draft._touched.length === 0) {
      return { ok: false, reason: 'Nothing usable came back — try describing them a different way.' };
    }
    return { ok: true, draft };
  } catch (e) {
    console.warn('Concept fill failed:', e && e.message);
    return { ok: false, reason: `Generation failed: ${(e && e.message) || 'unknown error'}` };
  }
}

// ---------------------------------------------------------------------------
// The "Describe & Generate" section (plan D6/D7/D10).
//
// One renderer, four surfaces. It lives here rather than in fields.js because
// it is this feature's UI, not a generic control — and here rather than in any
// one surface's file because concept.js loads before all four of them
// (render.computer.js, ui.computer.js, studio.js, menu.js), so every consumer
// can reach it without a load-order dance.
//
// Every document touch is guarded, so the file still loads in the vm harness
// and the engine half above stays directly testable.
//
// The section owns NO state of its own. `state` is passed in by the surface
// and lives wherever that surface's other state lives — classifieds.studio for
// the Character Studio, studioSubject for the player studio, the roommate
// record for the sandbox. Never the DOM (the house pattern).
// ---------------------------------------------------------------------------

function defaultConceptState() {
  return { open: false, text: '', busy: false, replace: false, lastError: '' };
}

// D6: the label is "Describe & Generate", the button is "Generate", and
// nothing here ever says "vibe". Stated once, in one table, so five surfaces
// cannot invent five wordings.
const CONCEPT_COPY = {
  player: {
    title: 'Describe & Generate',
    hint: 'Say who you are in a sentence or two and the rest of this form fills itself in. Everything stays editable afterwards.',
    placeholder: 'e.g. mid-thirties, ex-restaurant kitchen, tattoos going grey, dresses like he is always about to leave',
  },
  npcAppearance: {
    title: 'Describe & Generate',
    hint: 'Describe how they look. Only their appearance is filled in — name and personality stay where you set them.',
    placeholder: 'e.g. tall, lavender undercut grown out, scrubs and whatever was on the chair',
  },
  npcFull: {
    title: 'Describe & Generate',
    hint: 'Describe them in a sentence or two and the whole sheet fills itself in — look, personality, history, the lot. Everything stays editable afterwards.',
    placeholder: 'e.g. an overnight radio host who is generous with strangers and evasive with everyone else',
  },
  npcRewrite: {
    title: 'Describe & Generate',
    hint: 'Describe who they are now. This rewrites their character sheet — your history with them, their room and how they feel about you are all kept.',
    placeholder: 'e.g. same person, but the divorce went through and she has stopped pretending it was fine',
  },
};

// opts: { key, scope, toggleAction, generateAction }
//   key            unique per surface — the studio can open OVER the sandbox,
//                  so two sections can exist at once and a bare
//                  querySelector would read the wrong textarea.
//   toggleAction   click verb that flips state.open
//   generateAction click verb that runs the fill
function renderConceptSection(state, opts) {
  if (typeof document === 'undefined') return null;
  const o = opts || {};
  const s = state || defaultConceptState();
  const copy = CONCEPT_COPY[o.scope] || CONCEPT_COPY.npcFull;
  const key = o.key || o.scope || 'concept';

  const wrap = document.createElement('div');
  wrap.className = 'concept-section';
  wrap.setAttribute('data-concept-key', key);

  // D7: collapsed by default, and it never blocks anything. A player who
  // never opens it sees exactly the form they saw before this existed.
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'concept-toggle' + (s.open ? ' concept-open' : '');
  if (o.toggleAction) toggle.setAttribute('data-action', o.toggleAction);
  toggle.setAttribute('data-row-id', key);
  toggle.innerHTML = `<span class="concept-caret">${s.open ? '▾' : '▸'}</span><span class="concept-title">${copy.title}</span>`;
  wrap.appendChild(toggle);

  if (!s.open) return wrap;

  const body = document.createElement('div');
  body.className = 'concept-body';

  const hint = document.createElement('p');
  hint.className = 'concept-hint';
  hint.textContent = copy.hint;
  body.appendChild(hint);

  const ta = document.createElement('textarea');
  ta.className = 'concept-input';
  ta.rows = 3;
  ta.maxLength = CONCEPT_MAX_DESCRIPTION;
  ta.placeholder = copy.placeholder;
  ta.value = s.text || '';
  ta.setAttribute('data-concept-input', key);
  ta.disabled = !!s.busy;
  body.appendChild(ta);

  const row = document.createElement('div');
  row.className = 'concept-actions';

  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn concept-go';
  if (o.generateAction) go.setAttribute('data-action', o.generateAction);
  go.setAttribute('data-row-id', key);
  go.textContent = s.busy ? 'Generating…' : 'Generate';
  go.disabled = !!s.busy;
  row.appendChild(go);

  // D10: off by default. A fill merges OVER the draft and never blanks a
  // field the player typed, unless they ask for it here.
  //
  // `opts.hideReplace` (Phase 6): a rewrite has no draft to merge OVER — D12
  // is that the bible is fully replaced, previewed as a diff, and the player
  // approves or cancels the whole thing at the confirm panel. A checkbox
  // offering to NOT do that would be a control with no effect, which is worse
  // than no control — so it is not built at all for this scope, rather than
  // built and ignored.
  if (!o.hideReplace) {
    const replaceLabel = document.createElement('label');
    replaceLabel.className = 'concept-replace';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!s.replace;
    cb.disabled = !!s.busy;
    cb.setAttribute('data-concept-replace', key);
    replaceLabel.appendChild(cb);
    const cbText = document.createElement('span');
    cbText.textContent = 'Replace what I\'ve already written';
    replaceLabel.appendChild(cbText);
    row.appendChild(replaceLabel);
  }

  body.appendChild(row);

  if (s.lastError) {
    const err = document.createElement('div');
    err.className = 'concept-error';
    err.textContent = s.lastError;
    body.appendChild(err);
  }

  wrap.appendChild(body);
  return wrap;
}

// Read the section's live controls. Returns null when the section is not on
// screen, so a stale action verb cannot fire a fill against nothing.
function readConceptControls(key) {
  if (typeof document === 'undefined') return null;
  const sel = String(key).replace(/"/g, '\\"');
  const ta = document.querySelector(`[data-concept-input="${sel}"]`);
  if (!ta) return null;
  const cb = document.querySelector(`[data-concept-replace="${sel}"]`);
  return { text: String(ta.value || '').trim(), replace: !!(cb && cb.checked) };
}

// D10's merge. `incoming` wins only where the target has nothing, unless
// `replace` is set. Recurses into plain objects so a half-authored appearance
// keeps the fields the player set and gains the ones they didn't — the same
// per-leaf rule mergeAuthoredPhysical uses on the other side of the pipeline.
//
// Arrays are LEAVES here on purpose: half-merging two lists of quirks produces
// a character with six quirks and no author, which is worse than either list.
function conceptHasValue(v) {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

function conceptMergeInto(target, incoming, replace) {
  if (!incoming || typeof incoming !== 'object') return target;
  const out = target && typeof target === 'object' ? target : {};
  for (const [k, v] of Object.entries(incoming)) {
    if (k === '_touched') continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = conceptMergeInto(out[k], v, replace);
      continue;
    }
    if (!conceptHasValue(v)) continue;
    if (replace || !conceptHasValue(out[k])) out[k] = v;
  }
  return out;
}

// ===== /SECTION: CONCEPT =====
