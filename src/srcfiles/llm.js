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
    prompt += buildNpcBlockV2(npc, playerAction);  // NPC Overhaul Phase 2 + Phase 4 (query for retrieval)
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
  "actions": ["*physical action in asterisks*", "*another action*"],
  "dialogue": [
    { "speaker": "${activeNpcs[0]?.name || 'NPC'}", "text": "what they say, in their voice" }
  ],
  "internal": "optional: a brief thought an NPC has but doesn't say aloud",
  "relationshipDeltas": {
    "${activeNpcs[0]?.id || 'npc_id'}": { "trust": 0.0, "affection": 0.0, "tension": 0.0, "respect": 0.0, "comfort": 0.0, "desire": 0.0 }
  },
  "moodDeltas": {
    "${activeNpcs[0]?.id || 'npc_id'}": 0.0
  },
  "moodReasons": {
    "${activeNpcs[0]?.id || 'npc_id'}": "optional: why their mood changed (e.g. 'frustrated about work', 'amused by the joke')"
  },
  "memoryAdditions": {
    "${activeNpcs[0]?.id || 'npc_id'}": { "facts": [], "episodes": [], "grievances": [], "resolveGrievances": [] }
  },
  "topic": "optional: what this exchange was about (e.g. 'cooking', 'personal/feelings')",
  "advocateFor": "optional: use ONLY if an NPC present (or you, as the player) naturally suggests someone should move into the apartment. Set it to that person's NAME as listed in the speaker's [Relationships with others] section, and write the suggestion into their dialogue. Only use it when the speaker is close to that person (high affection/trust there) — a stranger shouldn't be vouched for. If set, narrate the suggestion in dialogue; the game turns it into a real move-in offer.",
  "effects": []
}

CRITICAL RULES:
- Write the narration and dialogue as fiction, NOT as a description of what you're doing.
- Dialogue must sound like the character speaking based on their temperament and speech profile.
- actions are physical actions in asterisks (e.g. "*leans against the counter*"). 0-3 per response. Omit if none.
- internal is optional — a brief thought the NPC has but doesn't voice. Omit if none.
- topic is optional — a short label for what this exchange was about. Used to track conversation variety.
- Relationship deltas are tiny: trust/affection/tension/respect/comfort/desire range -0.3 to +0.3. Mood -0.2 to +0.2.
- If nothing changes, set all deltas to 0.0 or omit the field.
- memoryAdditions: facts/episodes/grievances the NPC should remember from this exchange. resolveGrievances: text of grievances that were addressed this turn. Omit if nothing notable.
- effects is optional: a list of world-change lines drawn ONLY from the OPTIONAL WORLD CHANGES list above (e.g. "ADJUST_NEED player hunger +10"). Omit it or leave it empty if nothing applies. Never invent a new effect type or reference someone not listed above.
- advocateFor is optional and RARE — only when someone naturally suggests moving in (usually a resident close to their friend/partner). One NPC can raise it per turn, max. Omit unless it genuinely fits the conversation.
- Keep it SHORT. One narration paragraph, 1-3 dialogue lines max.
- Do not break the fourth wall. Do not describe the format. Just tell the story.`;

  return prompt;
}

// --- Build the IM prompt for a single-npc text exchange (COMPUTER's im
// app) — same buildNpcBlockV2 as the scene prompt, no room/scene framing,
// and a narrower, IM-flavored output contract (no narration field, no
// object/item effects — see assembleImContext's file comment for why the
// reach-set already blocks those regardless). ---
function buildImPrompt(context, message) {
  const npc = context.activeNpcs[0];

  let prompt = `You are the narrator for a slice-of-life apartment simulation, writing ${npc.name}'s side of a text-message conversation with the player. This is texting, not a scene — no narration, no scene-setting, just their reply.

${buildStyleSection(context.contentConfig)}
${buildContentSection(context.contentConfig)}
${buildNpcBlockV2(npc, message)}  // NPC Overhaul Phase 2 + Phase 4 (query for retrieval)
Texting style: ${npc.bible.speech.textingStyle}.

THE PLAYER JUST TEXTED: "${message}"

RESPOND WITH VALID JSON IN THIS EXACT FORMAT (no other text, no markdown):
{
  "dialogue": [ { "speaker": "${npc.name}", "text": "their reply, in their texting style" } ],
  "relationshipDeltas": { "${npc.id}": { "trust": 0.0, "affection": 0.0, "tension": 0.0, "respect": 0.0 } },
  "moodDeltas": { "${npc.id}": 0.0 },
  "moodReasons": { "${npc.id}": "optional: why their mood changed" },
  "memoryAdditions": { "${npc.id}": { "facts": [], "episodes": [] } },
  "topic": "optional: what this exchange was about",
  "advocateFor": "optional: use ONLY if the NPC naturally suggests in their reply that someone should move into the apartment — set it to that person's NAME as listed in their [Relationships with others] section. Only when they're close to that person. Omit otherwise."
}

CRITICAL RULES:
- Write only what they'd actually text back — short, in their voice (verbosity ${npc.bible.speech.verbosity}, formality ${npc.bible.speech.formality}), matching their texting style.
- Relationship deltas are tiny: -0.3 to +0.3. Mood -0.2 to +0.2. If nothing changes, omit them.
- moodReasons: optional — why their mood changed. Omit if no mood delta.
- memoryAdditions: optional — facts/episodes worth remembering. Omit if nothing notable.
- topic is optional — a short label for what this exchange was about.
- advocateFor is optional and RARE — only a natural, earned suggestion from this NPC, never forced.
- 1-3 short messages max, not a paragraph. No narration field — dialogue only.`;

  return prompt;
}

// ===== NPC Overhaul Phase 2: V2 prompt builders =====

// Temperament axes → behavioral directives
function temperamentDirective(npc) {
  const t = npc.bible.temperament;
  const dirs = [];
  if (t.warmth > 0.5) dirs.push('engaged, caring, warm in interactions');
  else if (t.warmth < -0.3) dirs.push('polite but distant, guarded');
  if (t.volatility > 0.5) dirs.push('emotionally reactive, quick to show feelings');
  else if (t.volatility < -0.3) dirs.push('steady, composed, rarely shows strong emotion');
  if (t.openness > 0.5) dirs.push('shares freely, curious about others');
  else if (t.openness < -0.3) dirs.push('guarded about personal matters, deflects');
  if (t.assertiveness > 0.5) dirs.push('direct, takes charge in conversations');
  else if (t.assertiveness < -0.3) dirs.push('passive, waits for others to lead');
  if (t.conscientiousness > 0.5) dirs.push('careful with words, thinks before speaking');
  else if (t.conscientiousness < -0.3) dirs.push('careless, says things without thinking');
  return dirs.length > 0 ? dirs.join('; ') : 'even-keeled';
}

// Relationship axes + phase → behavioral directives
function relationshipDirective(npc) {
  const rel = npc.relPlayer;
  const dirs = [];
  const phase = rel.conversationPhase || 'early';
  if (phase === 'early') dirs.push('You barely know them. Be polite but neutral. Don\'t assume familiarity.');
  else if (phase === 'familiar') dirs.push('You\'ve gotten to know them. Be warmer, reference shared experiences.');
  else if (phase === 'close') dirs.push('You\'re close. Be warm and open. Small gestures matter.');
  else if (phase === 'intimate') dirs.push('You\'re deeply connected. Physical and emotional closeness colors everything.');
  if (rel.tension > 0.4) dirs.push('There\'s tension between you. Be guarded, short, or sharp.');
  if (rel.trust > 0.5) dirs.push('You trust them. You can be vulnerable.');
  if (rel.affection < -0.2) dirs.push('You\'re not fond of them. Be cool, keep distance.');
  if ((rel.desire || 0) > 0.3) dirs.push('There\'s attraction. Notice their body, their proximity. Let it color your responses.');
  return dirs.join(' ');
}

// Format unresolved grievances
function grievancesLine(npc) {
  const grievances = (npc.relPlayer?.grievances || []).filter(g => !g.resolved);
  if (grievances.length === 0) return '';
  return 'Grievances: ' + grievances.map(g => g.text).join('; ') + ' (unresolved)';
}

// Clothing label for prompt
function clothingLabel(npc) {
  const c = npc.clothing;
  if (!c || c === 'dressed') return 'dressed normally';
  if (c === 'sleepwear') return 'in sleepwear';
  if (c === 'towel') return 'wrapped in a towel (just showered)';
  if (c === 'undressed') return 'undressed';
  return c;
}

// [Style tracking directive is now sourced from buildMemorySliceV2's
// styleDirective field, which reads styleCounters from the full NPC object.
// The old styleDirective(npc) function here was dead code — it tried to
// read npc.memory.styleCounters, but npc in the context is the NPC object
// from gameState.npcs (which DOES have styleCounters). However it was
// redundant with getStyleDirective in npc.js which buildMemorySliceV2
// already calls. Removed in audit.]

// The V2 NPC block — feeds from all 5 layers
// NPC Overhaul Phase 4: accepts optional query for memory retrieval.
// NPC Overhaul Audit Fix: buildMemorySliceV2 is called HERE with the query
// (not pre-built with null in assembleContext) so retrieval actually fires.
function buildNpcBlockV2(npc, query) {
  const b = npc.bible;
  const memV2 = buildMemorySliceV2(npc, query);  // retrieval fires with real query
  const rel = npc.relPlayer;

  let block = `\n=== ${npc.name} (ID: ${npc.id}) ===\n`;

  // [Physical]
  const physDesc = (typeof getPhysicalDescriptionForPrompt === 'function' ? getPhysicalDescriptionForPrompt(npc) : null) || b.visual || '';
  if (physDesc) block += `[Physical]: ${physDesc}\n`;
  // Phase 0: explicit age + gender for the LLM
  if (typeof b.age === 'number') block += `[Identity]: ${b.age}-year-old ${b.gender || 'female'}\n`;

  // [Temperament]
  const t = b.temperament;
  block += `[Temperament]: warmth ${t.warmth}, volatility ${t.volatility}, openness ${t.openness}, conscientiousness ${t.conscientiousness}, assertiveness ${t.assertiveness}\n  → ${temperamentDirective(npc)}\n`;

  // AfterHours Phase 8: surface the baked deviant number (present on every
  // external NPC via createExternalNpc; cast roommates have no field, so
  // nothing is emitted) so conversation can naturally read more forward for
  // high-deviant people without hard-coding lines. The number is an
  // intentional hint to colour flirtation/boundary-pushing, not a mandate.
  if (typeof b.deviantLevel === 'number') {
    block += `[Deviant disposition]: ${b.deviantLevel.toFixed(2)} on a 0-1 scale (0 = conventional, 1 = very forward). Let this colour how forward, unfazed, and boundary-pushing they are about sex, innuendo, and flirtation — especially with the player.\n`;
  }

  // [Personality]
  const pers = b.personality;
  if (pers && (pers.traits?.length > 0 || pers.coreTrait || pers.quirks?.length > 0)) {
    block += `[Personality]: ${(pers.traits || []).join(', ') || 'none'}`;
    if (pers.coreTrait) block += ` — core: ${pers.coreTrait}`;
    if (pers.hiddenTrait) block += `, hidden: ${pers.hiddenTrait}`;
    block += '\n';
    if (pers.quirks?.length > 0) block += `  Quirks: ${pers.quirks.join(', ')}\n`;
    if (pers.likes?.length > 0) block += `  Likes: ${pers.likes.join(', ')}\n`;
    if (pers.dislikes?.length > 0) block += `  Dislikes: ${pers.dislikes.join(', ')}\n`;
  }

  // [Occupation]
  block += `[Occupation]: ${b.occupation?.title || 'unknown'} (${b.occupation?.hours || 'flexible'})\n`;

  // [Backstory]
  block += `[Backstory]: Want: ${b.want}. Wound: ${b.wound}. Blind spot: ${b.blindSpot}. Boundary: ${b.boundary}.\n`;

  // [Speech]
  block += `[Speech]: verbosity ${b.speech.verbosity}, formality ${b.speech.formality}, humor ${b.speech.humorStyle}, profanity ${b.speech.profanityLevel}`;
  if (b.speech.verbalTics?.length > 0) block += `, tics: ${b.speech.verbalTics.join(', ')}`;
  if (b.speech.textingStyle) block += `, texting: ${b.speech.textingStyle}`;
  block += '\n';

  // [Current state]
  block += `[Current state]: Mood: ${moodLabel(npc.mood)}`;
  if (npc.moodReason) block += ` (${npc.moodReason})`;
  block += `. Currently: ${npc.activity || 'idle'}. Wearing: ${clothingLabel(npc)}.`;
  // NPC Overhaul Phase 7.2 — schedule info
  if (npc.schedule && npc.schedule.currentBlock) {
    block += ` Schedule: in '${npc.schedule.currentBlock}' block`;
    if (npc.schedule.nextBlock) block += `, next is '${npc.schedule.nextBlock}'`;
    if (npc.schedule.willReturnAt !== null && npc.schedule.willReturnAt !== undefined) {
      block += `, returns at ${Math.floor(npc.schedule.willReturnAt / 60)}:${String(npc.schedule.willReturnAt % 60).padStart(2, '0')}`;
    }
    block += '.';
  }
  block += '\n';

  // Escorts (external-world plan Phase 7): the purchased service set as this
  // NPC's explicit in-fiction boundaries for the active visit (the
  // in-character half of the dual enforcement — the scene chips gate the
  // mechanical half). Attached to the context object by NPC.assembleContext.
  if (npc.escortSession?.boundaryText) {
    block += `[Current booking]: ${npc.escortSession.boundaryText}\n`;
  }

  // [Needs]
  block += needsLine(npc.needs);

  // [Relationship with player]
  block += `[Relationship with player]: ${rel.conversationPhase || 'early'} — ${relationshipDirective(npc)}\n`;
  block += `  trust ${rel.trust}, affection ${rel.affection}, tension ${rel.tension}, respect ${rel.respect}`;
  if (rel.comfort !== undefined) block += `, comfort ${rel.comfort}`;
  if (rel.desire !== undefined) block += `, desire ${rel.desire}`;
  block += '\n';
  const gLine = grievancesLine(npc);
  if (gLine) block += `  ${gLine}\n`;

  // [Relationships with others]
  if (npc.castWebSlice && npc.castWebSlice.length > 0) {
    block += `[Relationships with others]:\n`;
    for (const r of npc.castWebSlice) {
      block += `  - ${r.name} (${r.status}): trust ${r.relationship.trust}, affection ${r.relationship.affection}, tension ${r.relationship.tension}`;
      if (r.sharedHistory) block += ` — ${r.sharedHistory}`;
      block += '\n';
    }
  }

  // NPC Overhaul Phase 4 — Memory sections with retrieval
  // memV2 is always returned by buildMemorySliceV2 (never null), so the
  // old fallback branch is removed.
  {
    // [Memories — recent]
    if (memV2.recent) block += `[Memories — recent]: ${memV2.recent}\n`;

    // [Memories — retrieved] — keyword-scored relevant memories from ALL tiers
    if (memV2.retrievedFacts?.length > 0 || memV2.retrievedEpisodes?.length > 0) {
      const parts = [];
      if (memV2.retrievedFacts.length > 0) parts.push(memV2.retrievedFacts.join('; '));
      if (memV2.retrievedEpisodes.length > 0) parts.push(memV2.retrievedEpisodes.join('; '));
      block += `[Memories — retrieved]: ${parts.join(' | ')}\n`;
    }

    // [Memories — facts] — all valid facts
    if (memV2.facts.length > 0) {
      block += `[Memories — facts]: ${memV2.facts.join('; ')}\n`;
    }

    // [Memories — episodes]
    if (memV2.episodes.length > 0) {
      block += `[Memories — episodes]: ${memV2.episodes.slice(-5).join('; ')}\n`;
    }

    // [Memories — summary]
    if (memV2.summary) block += `[Memories — summary]: ${memV2.summary}\n`;
  }

  // [Style tracking] — from the V2 slice (styleDirective() in llm.js is dead code,
  // removed in audit — it read npc.memory.styleCounters which doesn't exist on the context object)
  if (memV2.styleDirective) block += `[Style tracking]: ${memV2.styleDirective}\n`;

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
  if ((needs.comfort || 50) < 30) flags.push('craving comfort');           // NPC Overhaul Phase 6
  if ((needs.stimulation || 50) < 30) flags.push('bored, restless');        // NPC Overhaul Phase 6
  const suffix = flags.length > 0 ? ` — ${flags.join(', ')}` : '';
  return `Needs: hunger ${Math.round(needs.hunger)}%, energy ${Math.round(needs.energy)}%, hygiene ${Math.round(needs.hygiene)}%, social ${Math.round(needs.social)}%, comfort ${Math.round(needs.comfort || 50)}%, stimulation ${Math.round(needs.stimulation || 50)}%${suffix}\n`;
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

// --- Call LLM for an IM reply ---
// Deliberately a simpler ladder than callLLM's (JSON.parse, then a single
// regex fallback for dialogue — no brace-matching tier): IM's contract is
// narrower (dialogue + tiny deltas, no narration, no object/item effects),
// so there's less shape to recover from a mangled response in the first
// place. Reuses validateProposal/applyProposal unchanged — an IM reply is
// validated and applied exactly like a scene proposal, just against a
// one-npc context with no room.
async function callImLLM(context, message) {
  const prompt = buildImPrompt(context, message);
  try {
    const response = await root.generateText({ instruction: prompt, startWith: '{' });
    let jsonStr = response.trim();
    if (!jsonStr.startsWith('{')) jsonStr = '{' + jsonStr;
    if (!jsonStr.endsWith('}')) jsonStr = jsonStr + '}';

    let proposal;
    try {
      proposal = JSON.parse(jsonStr);
    } catch (e) {
      const dialogue = [];
      const dialogueRegex = /"speaker"\s*:\s*"([^"]+)"[^}]*?"text"\s*:\s*"([^"]+)"/g;
      let match;
      while ((match = dialogueRegex.exec(jsonStr)) !== null) dialogue.push({ speaker: match[1], text: match[2] });
      if (dialogue.length === 0) return { valid: false, errors: ['unparseable IM response'], proposal: null };
      return { valid: true, errors: null, proposal: { dialogue } };
    }

    if (!proposal.dialogue) return { valid: false, errors: ['IM response missing dialogue'], proposal: null };
    const { valid, errors } = validateProposal(proposal, context);
    if (!valid) { console.warn('IM proposal failed validation:', errors); return { valid: false, errors, proposal: null }; }
    return { valid: true, errors: null, proposal };
  } catch (e) {
    console.warn('IM LLM call failed:', e.message);
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

    // NPC Overhaul Phase 1: merge LLM-returned fashion/accessories into physical
    const physical = structured.physical || {};
    if (prose.fashion && !physical.fashion) physical.fashion = prose.fashion;
    if (prose.accessories && !physical.accessories) physical.accessories = prose.accessories;

    return {
      name: prose.name || fallbackName(structured),
      visual: prose.visual || fallbackVisual(structured),
      age: structured.age,                                // Phase 0: preserve first-class age
      gender: structured.gender,                          // Phase 0: preserve first-class gender
      physical,                                            // NPC Overhaul Phase 1
      history: prose.history || fallbackHistory(structured),
      sketch: prose.sketch || fallbackSketch(structured),
      sampleLines: prose.sampleLines || fallbackSampleLines(structured),
    };
  } catch (e) {
    console.warn('Prose expansion failed, using fallback:', e.message);
    return {
      name: fallbackName(structured),
      visual: fallbackVisual(structured),
      age: structured.age,                                // Phase 0
      gender: structured.gender,                          // Phase 0
      physical: structured.physical || {},                 // NPC Overhaul Phase 1
      history: fallbackHistory(structured),
      sketch: fallbackSketch(structured),
      sampleLines: fallbackSampleLines(structured),
    };
  }
}

function buildProsePrompt(structured) {
  const t = structured.temperament;
  const p = structured.physical || {};
  const physDesc = p.hair?.color
    ? `Physical (pre-determined — DO NOT change): ${p.heightBuild || ''}, ${[p.hair?.length, p.hair?.color, p.hair?.style].filter(Boolean).join(' ')} hair, ${p.eyes?.color || ''} ${p.eyes?.shape || ''} eyes, ${p.skin?.tone || ''} skin, ${p.body?.shape || ''} build.`
    : '';
  const ageLine = typeof structured.age === 'number' ? `Age: ${structured.age} (DO NOT change)` : '';
  const genderLine = structured.gender ? `Gender: ${structured.gender} (DO NOT change)` : '';
  return `You are writing flavor text for a pre-generated character in a slice-of-life apartment sim. The character's traits are already determined. Write ONLY the flavor fields requested. Do NOT add or change any traits.

[CHARACTER STRUCTURE]
${ageLine}
${genderLine}
${physDesc}
Temperament: warmth ${t.warmth}, volatility ${t.volatility}, openness ${t.openness}, conscientiousness ${t.conscientiousness}, assertiveness ${t.assertiveness}
Personality: ${structured.personality?.traits?.join(', ') || 'TBD'} — core: ${structured.personality?.coreTrait || 'TBD'}, hidden: ${structured.personality?.hiddenTrait || 'TBD'}
Quirks: ${structured.personality?.quirks?.join('; ') || 'TBD'}
Likes: ${structured.personality?.likes?.join(', ') || 'TBD'}
Dislikes: ${structured.personality?.dislikes?.join(', ') || 'TBD'}
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
  "visual": "2-3 sentences of physical description. Be specific enough to generate consistent images. Incorporate the pre-determined physical traits above and add: age (22-34), distinguishing features, typical attire, and any details not already specified.",
  "fashion": "one phrase describing their typical fashion style beyond what's listed",
  "accessories": "jewelry, watches, bags, or other accessories they typically wear",
  "history": "one paragraph (3-5 sentences) explaining how they ended up in this apartment, drawing on their baggage and occupation. Do NOT contradict the given traits.",
  "sketch": "a one-line summary of their vibe/personality for quick reference (max 120 chars)",
  "sampleLines": ["3-5 example dialogue lines that reflect their speech profile, temperament, and personality traits (especially their core trait and quirks)"]
}

Respond with JSON only, no markdown.`;
}

// --- Fallback prose (templated from structured draw) ---
function fallbackName(structured) {
  const rng = mulberry32(structured.genSeed || hashStr(JSON.stringify(structured)));
  let pool;
  // Phase 0: use the first-class gender field rather than a blind seed
  // split. Trans_male/trans_female align name choice with gender; futanari
  // leans female. Neutral pool (first_n) is used ~20% of the time for any
  // gender so names stay varied.
  const gender = structured.gender || 'female';
  const useNeutral = rng() < 0.2;
  if (useNeutral) pool = CHAR_GEN.namePools.first_n;
  else if (gender === 'male' || gender === 'trans_male') pool = CHAR_GEN.namePools.first_m;
  else pool = CHAR_GEN.namePools.first_f; // female, futanari, trans_female
  return pool[Math.floor(rng() * pool.length)];
}

function fallbackVisual(structured) {
  // Phase 0: prefer the first-class age field; fall back to a deterministic
  // roll only for legacy structured objects that lack one.
  const storedAge = typeof structured.age === 'number' ? structured.age : null;
  // NPC Overhaul Phase 1: derive from physical object if available
  const p = structured.physical;
  if (p && p.hair && p.hair.color) {
    const rng = mulberry32((structured.genSeed || 1) + 1);
    const age = storedAge ?? (22 + Math.floor(rng() * 12));
    const hairStr = [p.hair.length, p.hair.color, p.hair.style].filter(Boolean).join(' ');
    const features = Array.isArray(p.distinguishingFeatures) ? p.distinguishingFeatures[0] : '';
    const fashion = p.fashion || '';
    let desc = `Age ${age}, ${p.heightBuild || p.build || 'average'} build, ${hairStr} hair, ${p.eyes?.color || ''} ${p.eyes?.shape || ''} eyes, ${p.skin?.tone || ''} skin.`;
    if (features) desc += ` ${features}.`;
    if (fashion) desc += ` Typically wears ${fashion}.`;
    return desc;
  }
  const rng = mulberry32((structured.genSeed || 1) + 1);
  const age = storedAge ?? (22 + Math.floor(rng() * 12));
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
// NPC Overhaul Phase 4 — updated for tiered memory structure
async function compactMemory(npc) {
  const episodes = npc.memory.episodes || [];
  const recent = npc.memory.recent || [];
  // NPC Overhaul Phase 4.12 — don't compact until we have both a rich
  // recent buffer AND enough episodes to justify compression
  if (episodes.length < MEMORY_BUDGET.maxEpisodes && !(recent.length >= 10 && episodes.length > 5)) return npc;

  // Summarize the oldest 2/3 of episodes (not the most recent)
  const cutoff = Math.floor(episodes.length * 2 / 3);
  const oldEpisodes = episodes.slice(0, cutoff);
  const keepEpisodes = episodes.slice(cutoff);
  if (oldEpisodes.length < 5) return npc;

  const episodeTexts = oldEpisodes.map(e => e.text).join('; ');
  const existingSummary = npc.memory.summary ? ` (existing summary: ${npc.memory.summary})` : '';
  try {
    const response = await root.generateText({
      instruction: `Summarize these memories in 2-3 sentences, preserving key relationship dynamics and emotional beats:${existingSummary}\n\n${episodeTexts}`,
      stopSequences: ['\n\n'],
    });
    return {
      ...npc,
      memory: {
        ...npc.memory,
        summary: response.trim().substring(0, MEMORY_BUDGET.maxSummaryLen),
        summaryRevision: (npc.memory.summaryRevision || 0) + 1,  // NPC Overhaul Phase 4.4
        episodes: keepEpisodes.filter(e => e.decay > 0.2 || e.day === 0), // keep recent + shared-history
      },
    };
  } catch (e) {
    return npc; // fail gracefully
  }
}

// --- Interruption prompt (Phase 5): generates an NPC's line when they
// walk in on the player masturbating. Unlike callLLM's JSON contract,
// this is a plain-text generation — the output is 1-3 sentences of
// dialogue, not a structured proposal. Uses startWith to kick off with
// the NPC's name, and stopSequences to cut off after the dialogue.
function buildInterruptionPrompt(gameState, npcId, clip, doorState) {
  const npc = gameState.npcs[npcId];
  if (!npc) return { instruction: 'Error: NPC not found.' };
  const b = npc.bible;
  const rel = npc.relPlayer || {};
  const t = b.temperament;

  const doorDesc = doorState === 'locked'
    ? "The door was locked. You knocked and they didn't answer right away, so you waited. When the door finally opened, they looked flustered and you caught a glimpse of what was on their screen before they could close the laptop."
    : "You opened the door without thinking — they didn't lock it.";

  const instruction = `You are ${b.name}, a roommate in a shared apartment. You just walked in on your roommate masturbating. They were watching "${clip.title}" (${clip.category}) on their computer.

Your personality:
- Warmth: ${t.warmth} (warm if positive, cold if negative)
- Volatility: ${t.volatility} (volatile if positive, steady if negative)
- Openness: ${t.openness} (open if positive, guarded if negative)
- Assertiveness: ${t.assertiveness} (bold if positive, passive if negative)
- Conscientiousness: ${t.conscientiousness} (careful if positive, careless if negative)

Your relationship with your roommate:
- Tension: ${rel.tension}
- Affection: ${rel.affection}
- Trust: ${rel.trust}

${doorDesc}

Write 1-3 sentences of what you say the moment you realize what's happening. Stay completely in character — let your personality show. React to what they're watching if you can see it. Don't be generic. If you're the type to crack a joke, crack one. If you're the type to get flustered, be flustered. If you're the type to be angry, be angry. If you're the type to play it cool, play it cool.

Speech style: ${b.speech?.textingStyle || 'casual'}, humor ${b.speech?.humorStyle || 'dry'}, verbosity ${b.speech?.verbosity || 0.5}, profanity level ${b.speech?.profanityLevel || 0.3}.

Write ONLY what you say — no narration, no actions, no stage directions. Just your words.`;

  return {
    instruction,
    startWith: b.name + ': ',
    stopSequences: ['\n\n', '\n\n—', '\n\n— '],
  };
}

// --- NPC caught peeping prompt (Phase 6): generates the NPC's line when
// the player catches them peeping. Reversed from buildInterruptionPrompt —
// the NPC is the voyeur, the player caught them. The NPC's reaction is
// shaped by personality (embarrassed, defensive, play-it-cool, etc). ---
function buildNpcCaughtPeepingPrompt(gameState, npcId, playerState) {
  const npc = gameState.npcs[npcId];
  if (!npc) return { instruction: 'Error: NPC not found.' };
  const b = npc.bible;
  const rel = npc.relPlayer || {};
  const t = b.temperament;

  const stateDesc = {
    masturbating: 'masturbating at your computer',
    showering: 'in the shower',
    sleeping: 'asleep in bed',
    undressed: 'getting changed',
  }[playerState] || 'in a private moment';

  const instruction = `You are ${b.name}, a roommate in a shared apartment. You were secretly watching your roommate ${stateDesc}, and they just caught you.

Your personality:
- Warmth: ${t.warmth} (warm if positive, cold if negative)
- Volatility: ${t.volatility} (volatile if positive, steady if negative)
- Openness: ${t.openness} (open if positive, guarded if negative)
- Assertiveness: ${t.assertiveness} (bold if positive, passive if negative)
- Conscientiousness: ${t.conscientiousness} (careful if positive, careless if negative)

Your relationship with your roommate:
- Tension: ${rel.tension}
- Affection: ${rel.affection}
- Trust: ${rel.trust}

You've been caught red-handed. React based on your personality. Do you apologize profusely? Get defensive? Try to play it off? Get flustered? Stay completely in character.

Speech style: ${b.speech?.textingStyle || 'casual'}, humor ${b.speech?.humorStyle || 'dry'}, verbosity ${b.speech?.verbosity || 0.5}, profanity level ${b.speech?.profanityLevel || 0.3}.

Write ONLY what you say — 1-2 sentences. No narration, no actions, no stage directions. Just your words.`;

  return {
    instruction,
    startWith: b.name + ': ',
    stopSequences: ['\n\n', '\n\n—', '\n\n— '],
  };
}

// ===== /SECTION: LLM =====
