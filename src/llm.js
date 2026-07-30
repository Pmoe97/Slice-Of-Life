// ===== SECTION: LLM =====
// Prompt construction, generateText call, response parsing, validation → proposal.
// LLM never writes to state directly — returns a proposal that NPC validates and applies.

// --- Build the scene prompt from assembled context ---
function buildScenePrompt(context, playerAction) {
  const { scene, player, activeNpcs, ambientNpcs, worldEvents } = context;

  let prompt = `You are the narrator for a slice-of-life apartment simulation. A player is controlling their character. You must respond to the player's action with in-character narration and dialogue for the NPCs.

${buildStyleSection(context.contentConfig)}
${buildContentSection(context.contentConfig)}

CURRENT SCENE:
- Location: ${scene.room}
- Time: ${scene.phase}, ${scene.time}, Day ${scene.day}
- Cleanliness: ${scene.cleanliness > 70 ? 'tidy' : scene.cleanliness > 40 ? 'lived-in' : 'messy'}

PLAYER:
- Current mood: ${moodLabel(player.mood)}
- Energy: ${Math.round(player.energy)}%, Hunger: ${Math.round(player.hunger)}%
- Player's action: "${playerAction}"

CHARACTERS PRESENT (these are the ONLY people who can speak):
`;

  for (const npc of activeNpcs) {
    prompt += buildNpcBlock(npc);
  }

  if (ambientNpcs.length > 0) {
    prompt += `\nAMBIENT (present but NOT speaking — mention in narration only):\n`;
    for (const npc of ambientNpcs) {
      prompt += `- ${npc.name}: ${npc.sketch} (currently ${npc.activity})\n`;
    }
  }

  // Secondhand information: things that happened recently, which a present
  // NPC might plausibly know about and reference in passing (not an
  // obligation — most turns won't call for it). This is what makes the
  // apartment feel like it kept living while the player wasn't watching.
  if (worldEvents && worldEvents.length > 0) {
    prompt += `\nRECENT HOUSEHOLD HAPPENINGS (background context — reference only if it fits naturally, don't force it):\n`;
    for (const evt of worldEvents) {
      prompt += `- ${evt.text}\n`;
    }
  }

  prompt += `\n${buildEffectVocabSection()}\n`;

  prompt += `\nRESPOND WITH VALID JSON IN THIS EXACT FORMAT (no other text, no markdown):
{
  "narration": "2-4 sentences describing what happens. Set the scene. Describe the NPCs' reactions. Do NOT write dialogue here.",
  "dialogue": [
    { "speaker": "${activeNpcs[0]?.name || 'NPC'}", "text": "what they say, in their voice" }
  ],
  "relationshipDeltas": {
    "${activeNpcs[0]?.id || 'npc_id'}": { "trust": 0.0, "affection": 0.0, "tension": 0.0, "respect": 0.0 }
  },
  "moodDeltas": {
    "${activeNpcs[0]?.id || 'npc_id'}": 0.0
  },
  "effects": []
}

CRITICAL RULES:
- Write the narration and dialogue as fiction, NOT as a description of what you're doing.
- Dialogue must sound like the character speaking based on their temperament and speech profile.
- Relationship deltas are tiny: trust/affection/tension/respect range -0.3 to +0.3. Mood -0.2 to +0.2.
- If nothing changes, set all deltas to 0.0 or omit the field.
- effects is optional: a list of world-change lines drawn ONLY from the OPTIONAL WORLD CHANGES list above (e.g. "ADJUST_NEED player hunger +10"). Omit it or leave it empty if nothing applies. Never invent a new effect type or reference someone not listed above.
- Keep it SHORT. One narration paragraph, 1-3 dialogue lines max.
- Do not break the fourth wall. Do not describe the format. Just tell the story.`;

  return prompt;
}

function buildNpcBlock(npc) {
  const b = npc.bible;
  const mem = npc.memory;
  const rel = npc.relPlayer;

  let block = `
--- ${npc.name} (ID: ${npc.id}) ---
Temperament: warmth ${b.temperament.warmth}, volatility ${b.temperament.volatility}, openness ${b.temperament.openness}, conscientiousness ${b.temperament.conscientiousness}, assertiveness ${b.temperament.assertiveness}
Occupation: ${b.occupation?.title || 'unknown'} (${b.occupation?.hours || 'flexible'})
Want: ${b.want}
Wound: ${b.wound}
Blind spot: ${b.blindSpot}
Boundary: ${b.boundary}
Speech: verbosity ${b.speech.verbosity}, formality ${b.speech.formality}, humor ${b.speech.humorStyle}, profanity ${b.speech.profanityLevel}
Current mood: ${moodLabel(npc.mood)}
Currently: ${npc.activity}
${needsLine(npc.needs)}Relationship with player: trust ${rel.trust}, affection ${rel.affection}, tension ${rel.tension}, respect ${rel.respect}
`;

  if (mem.facts.length > 0) {
    block += `Memory (facts): ${mem.facts.join('; ')}\n`;
  }
  if (mem.episodes.length > 0) {
    block += `Memory (episodes): ${mem.episodes.join('; ')}\n`;
  }
  if (mem.summary) {
    block += `Memory (summary): ${mem.summary}\n`;
  }

  if (npc.castWebSlice && npc.castWebSlice.length > 0) {
    block += `Relationships with other roommates:\n`;
    for (const r of npc.castWebSlice) {
      block += `  - ${r.name} (${r.status}): trust ${r.relationship.trust}, affection ${r.relationship.affection}, tension ${r.relationship.tension}`;
      if (r.sharedHistory) block += ` — shared history: ${r.sharedHistory}`;
      block += `\n`;
    }
  }

  return block;
}

function moodLabel(mood) {
  if (mood > 0.5) return 'good';
  if (mood > 0.2) return 'content';
  if (mood > -0.2) return 'neutral';
  if (mood > -0.5) return 'tense';
  return 'upset';
}

// Needs are now restored as well as decayed (see SIM's resolveTick), so
// they're a live signal worth giving the LLM — otherwise there's no way
// for narration to notice an NPC is hungry, tired, or touch-starved.
function needsLine(needs) {
  if (!needs) return '';
  const flags = [];
  if (needs.hunger < 30) flags.push('hungry');
  if (needs.energy < 30) flags.push('tired');
  if (needs.hygiene < 30) flags.push('could use a shower');
  if (needs.social < 30) flags.push('craving company');
  const suffix = flags.length > 0 ? ` — ${flags.join(', ')}` : '';
  return `Needs: hunger ${Math.round(needs.hunger)}%, energy ${Math.round(needs.energy)}%, hygiene ${Math.round(needs.hygiene)}%, social ${Math.round(needs.social)}%${suffix}\n`;
}

// --- Call LLM and parse response ---
async function callLLM(context, playerAction) {
  const prompt = buildScenePrompt(context, playerAction);
  // Tracks which tier of the degradation ladder this call landed on, for
  // LLM_TELEMETRY (EFFECTS section) — surfaced in the debug panel. 1=clean
  // JSON.parse, 2=brace-matched substring, 3=regex extraction, 4=nothing
  // recoverable (validation failure or a thrown exception).
  let parseTier = null;
  try {
    const response = await root.generateText({
      instruction: prompt,
      startWith: '{',
    });

    // Response already includes the startWith prefix '{'
    let jsonStr = response.trim();

    // Ensure it starts with {
    if (!jsonStr.startsWith('{')) {
      jsonStr = '{' + jsonStr;
    }
    // Ensure it ends with }
    if (!jsonStr.endsWith('}')) {
      jsonStr = jsonStr + '}';
    }

    let proposal;
    try {
      proposal = JSON.parse(jsonStr);
      parseTier = 1;
    } catch (parseErr) {
      // Try to find valid JSON by matching braces
      let depth = 0;
      let lastValid = -1;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') depth++;
        else if (jsonStr[i] === '}') {
          depth--;
          if (depth === 0) { lastValid = i; break; }
        }
      }
      if (lastValid > 0) {
        try {
          proposal = JSON.parse(jsonStr.substring(0, lastValid + 1));
          parseTier = 2;
        } catch (e2) {
          // Fall through to regex extraction
        }
      }

      if (!proposal) {
        // Regex extraction fallback. Also sweeps for effect DSL lines
        // (EFFECTS section) directly in the raw text — a mangled JSON
        // response can still carry recoverable "TYPE param param" lines,
        // which is the whole point of a flat string grammar over nested
        // JSON: less to break, more to recover.
        const textMatch = jsonStr.match(/"narration"\s*"?\s*:\s*"([^"]+)"/);
        const narration = textMatch ? textMatch[1] : 'Something happens.';
        const dialogue = [];
        const dialogueRegex = /"speaker"\s*:\s*"([^"]+)"[^}]*?"text"\s*:\s*"([^"]+)"/g;
        let match;
        while ((match = dialogueRegex.exec(jsonStr)) !== null) {
          dialogue.push({ speaker: match[1], text: match[2] });
        }
        const effects = parseEffectDSL(jsonStr).map(e => e.raw);
        recordParseTier(3);
        return { valid: true, errors: null, proposal: { narration, dialogue, effects } };
      }
    }

    // Normalize: if LLM returned unexpected keys, wrap as narration
    if (!proposal.narration && !proposal.dialogue) {
      const rawText = proposal.text || proposal.action || proposal.response || JSON.stringify(proposal);
      recordParseTier(parseTier || 2);
      return { valid: true, errors: null, proposal: { narration: rawText, dialogue: [] } };
    }

    // Validate proposal
    const { valid, errors } = validateProposal(proposal, context);
    if (!valid) {
      console.warn('LLM proposal failed validation:', errors);
      recordParseTier(4);
      return { valid: false, errors, proposal: null };
    }

    recordParseTier(parseTier || 1);
    return { valid: true, errors: null, proposal };
  } catch (e) {
    console.warn('LLM call failed:', e.message);
    recordParseTier(4);
    return { valid: false, errors: [e.message], proposal: null };
  }
}

// --- Character prose expansion ---
// LLM writes flavor only: name, physical description, history, sample speech lines.
// It never selects traits and never invents fields.
// Falls back to templated prose on failure.

async function expandCharacterProse(structured) {
  const prompt = buildProsePrompt(structured);
  try {
    const response = await root.generateText({
      instruction: prompt,
      startWith: '{',
      stopSequences: ['}\n'],
    });

    let jsonStr = response.trim();
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end > start) {
      jsonStr = jsonStr.substring(start, end + 1);
    }
    const prose = JSON.parse(jsonStr);

    return {
      name: prose.name || fallbackName(structured),
      visual: prose.visual || fallbackVisual(structured),
      history: prose.history || fallbackHistory(structured),
      sketch: prose.sketch || fallbackSketch(structured),
      sampleLines: prose.sampleLines || fallbackSampleLines(structured),
    };
  } catch (e) {
    console.warn('Prose expansion failed, using fallback:', e.message);
    return {
      name: fallbackName(structured),
      visual: fallbackVisual(structured),
      history: fallbackHistory(structured),
      sketch: fallbackSketch(structured),
      sampleLines: fallbackSampleLines(structured),
    };
  }
}

function buildProsePrompt(structured) {
  const t = structured.temperament;
  const genderHint = structured.occupation?.title ? '' : '';
  return `You are writing flavor text for a pre-generated character in a slice-of-life apartment sim. The character's traits are already determined. Write ONLY the flavor fields requested. Do NOT add or change any traits.

[CHARACTER STRUCTURE]
Temperament: warmth ${t.warmth}, volatility ${t.volatility}, openness ${t.openness}, conscientiousness ${t.conscientiousness}, assertiveness ${t.assertiveness}
Occupation: ${structured.occupation?.title || 'TBD'} — ${structured.occupation?.hours || 'flexible'} hours
Interests: ${structured.interests?.map(i => i.name).join(', ') || 'TBD'}
Values: ${structured.values?.map(v => v.name).join(', ') || 'TBD'}
Baggage: ${structured.baggage}
Wound: ${structured.wound}
Want: ${structured.want}
Blind spot: ${structured.blindSpot}
Speech: verbosity ${structured.speech.verbosity}, formality ${structured.speech.formality}, humor ${structured.speech.humorStyle}, profanity ${structured.speech.profanityLevel}

[INSTRUCTIONS]
Write JSON only:
{
  "name": "a believable first name (no surname needed) that fits the character",
  "visual": "2-3 sentences of physical description. Age, build, hair, distinctive features, typical attire. Be specific enough to generate consistent images.",
  "history": "one paragraph (3-5 sentences) explaining how they ended up in this apartment, drawing on their baggage and occupation. Do NOT contradict the given traits.",
  "sketch": "a one-line summary of their vibe/personality for quick reference (max 120 chars)",
  "sampleLines": ["3-5 example dialogue lines that reflect their speech profile and temperament"]
}

Respond with JSON only, no markdown.`;
}

// --- Fallback prose (templated from structured draw) ---
function fallbackName(structured) {
  const rng = mulberry32(structured.genSeed || hashStr(JSON.stringify(structured)));
  let pool;
  // Simple gender assignment from seed
  const g = rng();
  if (g < 0.4) pool = CHAR_GEN.namePools.first_f;
  else if (g < 0.8) pool = CHAR_GEN.namePools.first_m;
  else pool = CHAR_GEN.namePools.first_n;
  return pool[Math.floor(rng() * pool.length)];
}

function fallbackVisual(structured) {
  const rng = mulberry32((structured.genSeed || 1) + 1);
  const age = 22 + Math.floor(rng() * 12);
  const builds = ['slim', 'athletic', 'average', 'tall and lean', 'curvy', 'stocky'];
  const hairs = ['short dark hair', 'long brown hair', 'curly red hair', 'bleached blonde hair', 'black locs', 'messy auburn hair', 'shaved head', 'shoulder-length black hair'];
  const features = ['glasses', 'a nose ring', 'tattoos on their arms', 'a scar through their eyebrow', 'freckles', 'dark circles under their eyes', 'a crooked smile'];
  const attire = ['casual hoodies and jeans', 'thrifted vintage', 'minimalist monochrome', 'bright patterns', 'comfort-first athleisure'];
  return `Age ${age}, ${builds[Math.floor(rng() * builds.length)]} build, ${hairs[Math.floor(rng() * hairs.length)]}. ${features[Math.floor(rng() * features.length)]}. Typically wears ${attire[Math.floor(rng() * attire.length)]}.`;
}

function fallbackHistory(structured) {
  const occ = structured.occupation?.title || 'works';
  return `After ${structured.baggage}, they found their way to ${occ.toLowerCase()} as a way forward. They moved into the apartment looking for ${structured.values?.[0]?.name || 'stability'} and a fresh start. ${structured.want.charAt(0).toUpperCase() + structured.want.slice(1)} — that's what drives them now, even if they ${structured.blindSpot.toLowerCase()}.`;
}

function fallbackSketch(structured) {
  const t = structured.temperament;
  const warm = t.warmth > 0 ? 'warm' : 'cool';
  const vol = t.volatility > 0 ? 'volatile' : 'steady';
  return `${warm} and ${vol}; ${structured.occupation?.title || 'flatmate'} who wants ${structured.want.substring(0, 40)}`;
}

function fallbackSampleLines(structured) {
  const t = structured.temperament;
  const lines = [];
  if (t.volatility > 0.3) {
    lines.push("Are you serious right now?");
    lines.push("I can't deal with this again.");
  } else {
    lines.push("Yeah, that's fine.");
    lines.push("Let me think about it.");
  }
  if (t.warmth > 0.3) {
    lines.push("Hey, you okay? You seem off today.");
  }
  if (t.assertiveness > 0.3) {
    lines.push("Look, we need to talk about this.");
  } else {
    lines.push("I don't know, maybe we should just leave it.");
  }
  if (structured.speech?.profanityLevel > 0.5) {
    lines.push("Jesus, what a mess.");
  }
  return lines.slice(0, 5);
}

// --- Memory summary compaction (piggyback on player-contact calls) ---
async function compactMemory(npc) {
  if (!npc.memory.summary && npc.memory.episodes.length < 10) return npc;

  const episodes = npc.memory.episodes.map(e => e.text).join('; ');
  try {
    const response = await root.generateText({
      instruction: `Summarize these memories in 2-3 sentences, preserving key relationship dynamics and emotional beats:\n\n${episodes}`,
      stopSequences: ['\n\n'],
    });
    return {
      ...npc,
      memory: {
        ...npc.memory,
        summary: response.trim().substring(0, MEMORY_BUDGET.maxSummaryLen),
        episodes: npc.memory.episodes.filter(e => e.day === 0), // keep shared-history beats
      },
    };
  } catch (e) {
    return npc; // fail gracefully
  }
}

// ===== /SECTION: LLM =====
