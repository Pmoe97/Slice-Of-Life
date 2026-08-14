// ===== SECTION: LLM =====
// Prompt construction, generateText call, response parsing, validation → proposal.
// LLM never writes to state directly — returns a proposal that NPC validates and applies.

// --- Build the scene prompt from assembled context ---
// Perception plan Phase 2 (D10): the composed sensory line, built from what
// the player can actually perceive right now (SIGNALS' perceiveSignals) using
// the authored phrase tables. This replaces a hardcoded binary odor line that
// could only ever say one of two things and only about this exact room.
//
// Phrases are authored and composed deterministically rather than generated
// (roadmap R1), so the line costs nothing, cannot contradict mechanical state,
// and reads the same all day. A signal drifting in from elsewhere says so.
//
// The prose is resolved upstream in NPC's assembleContext, which has gameState
// in scope, and arrives here as `rec.phrase`. Same reason getRecentEvents
// resolves its own text there rather than handing this file a raw template:
// prompt builders stay pure functions of their context.
function buildSensoryLine(scene) {
  const signals = scene.signals || [];
  const parts = signals.slice(0, 4).map(rec => {
    if (!rec.phrase) return null;
    return rec.here ? rec.phrase : `${rec.phrase} (drifting in from ${roomPhrase(rec.sourceRoomId)})`;
  }).filter(Boolean);
  if (parts.length === 0) return '- Nothing much registers — no smells, nothing out of place.';
  return `- What you can sense: ${parts.join('; ')}.`;
}

function buildScenePrompt(context, playerAction) {
  const { scene, player, activeNpcs, ambientNpcs, worldEvents } = context;

  let prompt = `You are the narrator for a slice-of-life apartment simulation. A player is controlling their character. You must respond to the player's action with in-character narration and dialogue for the NPCs.

${buildStyleSection(context.contentConfig)}
${buildContentSection(context.contentConfig)}

CURRENT SCENE:
- Location: ${scene.room}
- Time: ${scene.phase}, ${scene.time}, Day ${scene.day}
- Cleanliness: ${scene.cleanliness > 70 ? 'tidy' : scene.cleanliness > 40 ? 'lived-in' : 'messy'}
${buildSensoryLine(scene)}

PLAYER:
- Current mood: ${moodLabel(player.mood)}
- Energy: ${Math.round(player.energy)}%, Hunger: ${Math.round(player.hunger)}%
- Player's action: "${playerAction}"

CHARACTERS PRESENT (these are the ONLY people who can speak):
`;

  for (const npc of activeNpcs) {
    // NPC Overhaul Phase 2 + Phase 4 (query for retrieval). Correctness plan
    // Phase 1 (D6): 'scene' selects the in-person half of memory.recent, so
    // this prompt never shows text messages back as spoken dialogue.
    // Knowledge-gossip Phase 1 (D2): pass the current day so retrieval's
    // salience decay is read-time, not stale.
    prompt += buildNpcBlockV2(npc, playerAction, 'scene', scene.day);
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
  "moodDeltas": {
    "${activeNpcs[0]?.id || 'npc_id'}": 0.0
  },
  "moodReasons": {
    "${activeNpcs[0]?.id || 'npc_id'}": "optional: why their mood changed (e.g. 'frustrated about work', 'amused by the joke')"
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
- Mood deltas are tiny: -0.2 to +0.2. If nobody's mood changed, omit the field.
- Do NOT score the relationship. You write what happens; what it was worth is judged separately, afterwards, by someone who can read the whole conversation.
- Do NOT decide what anyone remembers. What the conversation taught them is extracted separately, afterwards, from the whole day's transcript.
- effects is optional: a list of world-change lines drawn ONLY from the OPTIONAL WORLD CHANGES list above (e.g. "ADJUST_NEED player energy -5"). Omit it or leave it empty if nothing applies. Never invent a new effect type or reference someone not listed above.
- NEVER emit a hunger change for the player. Eating is an item-driven action the player takes; narration can describe a meal, but it must not feed them.
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

  // Correctness plan Phase 1 (D7): the real persisted thread, assembled onto
  // the context by assembleImContext. Before this, an IM reply's only sense
  // of the conversation was the five-entry shared memory.recent buffer — so
  // a long text exchange was invisible to the model writing the next line.
  const thread = context.imThread || [];
  const transcript = thread
    .filter(m => m.from === 'player' || m.from === 'npc')
    .map(m => `${m.from === 'player' ? 'Them' : 'You'}: ${m.text}`)
    .join('\n');

  let prompt = `You are the narrator for a slice-of-life apartment simulation, writing ${npc.name}'s side of a text-message conversation with the player. This is texting, not a scene — no narration, no scene-setting, just their reply.

${buildStyleSection(context.contentConfig)}
${buildContentSection(context.contentConfig)}
${buildNpcBlockV2(npc, message, 'im', context.day)}
Texting style: ${npc.bible.speech.textingStyle}.
${transcript ? `\nTHE CONVERSATION SO FAR (oldest first — "You" is ${npc.name}, "Them" is the player):\n${transcript}\n` : ''}
THE PLAYER JUST TEXTED: "${message}"

RESPOND WITH VALID JSON IN THIS EXACT FORMAT (no other text, no markdown):
{
  "dialogue": [ { "speaker": "${npc.name}", "text": "their reply, in their texting style" } ],
  "moodDeltas": { "${npc.id}": 0.0 },
  "moodReasons": { "${npc.id}": "optional: why their mood changed" },
  "topic": "optional: what this exchange was about",
  "advocateFor": "optional: use ONLY if the NPC naturally suggests in their reply that someone should move into the apartment — set it to that person's NAME as listed in their [Relationships with others] section. Only when they're close to that person. Omit otherwise."
}

CRITICAL RULES:
- Write only what they'd actually text back — short, in their voice (verbosity ${npc.bible.speech.verbosity}, formality ${npc.bible.speech.formality}), matching their texting style.
- Mood deltas are tiny: -0.2 to +0.2. Omit if their mood didn't change. Do NOT score the relationship — that is judged separately, afterwards.
- moodReasons: optional — why their mood changed. Omit if no mood delta.
- Do NOT decide what they remember — that is extracted separately, afterwards.
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

// Phase 8 (D8): the NPC's possessions as a comma-separated label list for
// buildNpcBlockV2's [Possessions] line. Reads the same npc.inventory stack
// list the room-search surfaces, so prose and gameplay can never disagree
// about what someone owns.
function possessionsLine(npc) {
  const inv = npc.inventory || [];
  if (inv.length === 0) return '';
  return inv
    .filter(s => (s?.qty || 0) > 0)
    .map(s => {
      const def = ITEM_DEFS[s.defId];
      const label = def?.label || s?.meta?.origName || s.defId;
      return s.qty > 1 ? `${label} ×${s.qty}` : label;
    })
    .join(', ');
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
// Correctness plan Phase 1 (D6): `channel` ('scene' | 'im') selects which
// conversation surface's history the [Memories — recent] line draws from.
// Knowledge-gossip Phase 1 (D2): `day` (the current in-game day, optional)
// feeds read-time salience decay in the retrieval rank.
function buildNpcBlockV2(npc, query, channel, day) {
  const b = npc.bible;
  const memV2 = buildMemorySliceV2(npc, query, channel || 'scene', day);  // retrieval fires with real query
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

  // Phase 8 (D8): what this NPC actually owns. Possessions ground the
  // prose — a musician's guitar is referenceable, a student's book is on
  // their nightstand — and are a real theft surface (the player's
  // room-search can take the non-key items).
  const owns = possessionsLine(npc);
  if (owns) block += `[Possessions]: ${owns}\n`;

  // [Backstory]
  block += `[Backstory]: Want: ${b.want}. Wound: ${b.wound}. Blind spot: ${b.blindSpot}. Boundary: ${b.boundary}.\n`;

  // [Speech]. Correctness plan Phase 5 wired vocabularyLevel and catchphrases
  // in — both were generated (and, for authored characters like Del,
  // hand-written) and never reached a prompt.
  block += `[Speech]: verbosity ${b.speech.verbosity}, formality ${b.speech.formality}, humor ${b.speech.humorStyle}, profanity ${b.speech.profanityLevel}`;
  if (typeof b.speech.vocabularyLevel === 'number') block += `, vocabulary ${b.speech.vocabularyLevel}`;
  if (b.speech.verbalTics?.length > 0) block += `, tics: ${b.speech.verbalTics.join(', ')}`;
  if (b.speech.textingStyle) block += `, texting: ${b.speech.textingStyle}`;
  block += '\n';
  if (b.speech.catchphrases?.length > 0) {
    block += `  Things they say: ${b.speech.catchphrases.map(c => `"${c}"`).join(' ')}\n`;
  }

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

  // [Senses] — perception plan Phase 5. What this character can sense right
  // now, which may differ from what the player can. Prose is pre-resolved in
  // assembleContext (same division as the scene's sensory line).
  if (npc.perceived?.length > 0) {
    const bits = npc.perceived
      .filter(r => r.phrase)
      .map(r => r.here ? r.phrase : `${r.phrase} (from ${roomPhrase(r.sourceRoomId)})`);
    if (bits.length > 0) block += `[Senses]: ${bits.join('; ')}\n`;
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

    // [Memories — facts] — the FACT_DISPLAY window (D15): pinned + significant
    // always, then retrieved-top, then most-recent, capped at maxTotal.
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

  // [Open question] — knowledge-gossip Phase 4 (D13), the bridge. An NPC
  // holding an open question at raiseThreshold raises it the next time the
  // player talks to them: the model renders the D9 record's topic on the
  // player's time budget, in a call that was going to happen anyway (D8's
  // LLM-at-moment-of-use — no background rumination call exists). Only NPCs
  // actually in the conversation reach buildNpcBlockV2 (ambient NPCs get a
  // one-line sketch in the prompt builders), so an ambient NPC's question
  // cannot leak into a scene line. Legacy saves may hold id-shaped targets
  // (pre-Phase-4 records stored npcIds); those are filtered rather than
  // rendered as internal ids.
  const openQ = topOpenQuestion(npc);
  if (openQ) {
    const names = (openQ.targets || []).filter(t => t && !/^npc_/.test(String(t)));
    block += `[Open question]: You've been wondering about ${openQ.topic || 'something'} and it's been nagging at you — bring it up naturally over the next few exchanges (do NOT blurt it out in your first reply). ${names.length > 0 ? `You'd expect ${names.join(' or ')} to know more about it. ` : ''}Ask what they know.\n`;
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

// ===== Plan X-5 Phase 2 — the Assessor =====
// A SECOND pass, over a window of exchanges that have already happened, whose
// only job is to score what they did to the relationship. It writes no
// dialogue, and the writer above no longer scores itself (D1/D5).
//
// The reason this is a separate call and not a field on the writing one: an
// NPC who has just written a warm, generous line is the worst available judge
// of whether the exchange earned warmth, and the deltas were emitted in the
// same generation as the dialogue — describing intent, before the line
// existed. The scoring happened before there was anything to score.
//
// The reason it is WINDOWED (D2) is drift. Judging per message multiplies any
// small optimistic bias by every exchange in the game, which is monotonic
// relationship inflation regardless of what the player does. A window makes
// "nothing really changed here" the easy answer, and it lets the judge see an
// arc — the player pushed three times and then backed off is legible across
// five exchanges and invisible in any one of them.

// One character's line in the roster: who they are, where the relationship
// currently sits as WORDS (D10), and what they and the player actually said.
function buildAssessorNpcBlock(gameState, npcId, entries) {
  const npc = gameState.npcs[npcId];
  if (!npc) return '';
  const name = npc.bible?.name || npcId;
  const rel = npc.relPlayer || {};
  const transcript = formatWindowTranscript(entries, { npcName: name });
  return `\n=== ${name} (ID: ${npcId}) ===
How they see the player right now: ${rel.conversationPhase || 'early'} — ${x5RelationshipLabels(rel)}
What was said (oldest first):
${transcript || '(nothing on record)'}\n`;
}

// The rubric. Every load-bearing line here is a locked decision:
//
//   D8  zero is the modal answer, and the prompt leads with it. A judge that
//       always finds some movement is the single most likely way this plan
//       fails silently — it looks alive and is a straight line.
//   D9  tension's valence is stated, twice. deriveConversationPhase SUBTRACTS
//       it, so a sign error here inverts the relationship model rather than
//       merely miscounting it.
//   D10 labels in, integers out. The state above is words; the answer is
//       integers. The prompt never shows a second number scale.
//   D7  integers on the wire. A malformed integer is obvious; a malformed
//       float is a plausible 10x error that parses cleanly.
function buildAssessorPrompt(gameState, win) {
  const clamp = X5.deltaClamp;
  const roster = (win.npcIds || []).map(id => buildAssessorNpcBlock(gameState, id, win.byNpc[id]?.entries)).join('');
  const idList = (win.npcIds || []).map(id => `"${id}"`).join(', ');
  const sample = (win.npcIds || [])[0] || 'npc_id';

  return `You are scoring a conversation in a slice-of-life apartment simulation. You did NOT write it — someone else did, and it has already happened. Your only job is to judge what it did to how each character below feels about the player.

MOST CONVERSATIONS CHANGE NOTHING. Small talk, a passing question, sorting out the dishes, a greeting — all zeros. That is the correct and most common answer. Only move an axis when something in the transcript actually earned it: a confidence shared, a boundary pushed, a kindness, a cruelty, a promise kept or broken, a real moment between two people.

Answer with whole numbers from -${clamp} to +${clamp} on each axis:
- 0 — nothing happened on this axis. Most axes, most windows.
- 1 to 3 — a small real shift.
- 4 to 6 — a notable one; something in the conversation clearly landed.
- 7 to ${clamp} — rare. Something that genuinely changes where these two stand.

THE AXES:
- trust — do they believe the player is honest and reliable? Moves on being confided in, on promises kept or broken, on being lied to or levelled with.
- affection — do they like the player? Moves on warmth, on humour that lands, on generosity, on being dismissed or needled.
- tension — friction between them. UP IS BAD: positive means the exchange left things worse (an argument, a boundary pushed, a sting left hanging). NEGATIVE means friction was defused — an apology accepted, air cleared. If nothing was strained either way, 0.
- respect — do they take the player seriously? Moves on competence, on integrity, on holding a position, on embarrassing yourself.
- comfort — physical and social ease around the player. Moves slowly, on relaxed and unforced contact, and drops on anything that makes them self-conscious.
- desire — attraction. Moves on flirtation that actually lands, on intimacy, on being noticed. 0 unless the exchange genuinely carried it.

WHO WAS IN IT:
${roster}
RESPOND WITH VALID JSON AND NOTHING ELSE — one object per character ID:
{ ${(win.npcIds || []).map(id => `"${id}": { "trust": 0, "affection": 0, "tension": 0, "respect": 0, "comfort": 0, "desire": 0 }`).join(', ') || `"${sample}": { "trust": 0, "affection": 0, "tension": 0, "respect": 0, "comfort": 0, "desire": 0 }`} }

Example — they talked about whose turn it was to buy washing powder (the ordinary case):
{ "${sample}": { "trust": 0, "affection": 0, "tension": 0, "respect": 0, "comfort": 0, "desire": 0 } }

Example — they admitted something they had been avoiding for weeks and the player was kind about it:
{ "${sample}": { "trust": 5, "affection": 3, "tension": -2, "respect": 0, "comfort": 2, "desire": 0 } }

Example — the player pushed a sore subject after being asked twice to drop it:
{ "${sample}": { "trust": -2, "affection": -1, "tension": 6, "respect": -3, "comfort": -2, "desire": 0 } }

RULES:
- Use these character IDs exactly and no others: ${idList}.
- Whole numbers only, -${clamp} to +${clamp}. Never a decimal. Never a percentage.
- Judge the WHOLE window as one arc, not line by line. What it ended up being is what counts.
- Judge what the exchange EARNED, not what would be pleasant. Effort the player put in that landed badly still landed badly.
- Lines marked "(text)" were sent as text messages, not said in person.
- Do not explain yourself, do not add commentary, do not use markdown. JSON only.`;
}

// The call. Returns { ok, deltas } where `deltas` is a relationshipDeltas
// proposal fragment ready for validateProposal/applyProposal (D4).
//
// D14 — a failed pass is a NO-OP, and this function is where "failed" is
// decided. It never throws and never retries: a doubled delta is worse than a
// missing one, and there is nothing to fall back TO now that the writer has
// stopped scoring (D5). `ok: false` and `ok: true` with empty deltas are
// deliberately different things — the second is the judge saying nothing
// changed (D8) — but the caller marks the window judged either way.
//
// LLM never writes state (this file's contract): the deltas are returned, and
// UI's runAssessorPass hands them to NPC's applyProposal.
async function callAssessor(gameState, win) {
  const npcIds = (win?.npcIds || []).filter(id => gameState?.npcs?.[id]);
  if (npcIds.length === 0) return { ok: false, deltas: {}, reason: 'empty window' };
  try {
    const response = await root.generateText({
      instruction: buildAssessorPrompt(gameState, win),
      startWith: '{',
    });
    // soleNpcId recovers the flat { "trust": 2 } shape a one-person window
    // invites. With two people in the room there is nobody to attribute a
    // flat answer to, and guessing whose relationship moved is worse than
    // not moving one — parseAssessorReply returns null and this is a no-op.
    const parsed = parseAssessorReply(response, { soleNpcId: npcIds.length === 1 ? npcIds[0] : null });
    if (parsed === null) {
      console.warn('Assessor reply unparseable; window judged as no-op');
      return { ok: false, deltas: {}, reason: 'unparseable' };
    }
    return { ok: true, deltas: toProposalDeltas(parsed, npcIds) };
  } catch (e) {
    console.warn('Assessor call failed:', e.message);
    return { ok: false, deltas: {}, reason: e.message };
  }
}

// ===== Plan X-5 Phase 3 — the Chronicler =====
// The second judging pass. Where the Assessor asks "what did that do to how
// they feel", this one asks "what does this character now KNOW that they did
// not know before" — and it is the only route conversation has into the
// belief tier now that the writer has stopped writing memory (D5).
//
// The reason it is a separate call from the Assessor and not a second field
// on it: they window differently on purpose (D3). Relationship movement is
// legible over a scene; a fact is not. Facts extract more accurately from
// more context, and a wider window dedupes for free — a thing raised three
// times in one evening is one fact rather than three. So the Chronicler reads
// a DAY per character, and the Assessor reads a room.
//
// The reason it exists at all is measured, not theoretical. Rumination's
// inference rules key on episode `participants` and `emotionalTag`; the
// ambient writer supplied neither, and a saturated 30-episode tier per
// resident yielded 0 inferred facts and 0 open questions. Everything below
// exists to make those two fields arrive populated (D13).

// The extractor's vocabulary for emotionalTag, read from the table that
// actually weighs it rather than restated here (README rule 5). An invented
// tag is normalised to '' by x5NormalizeEmotionalTag, which costs the episode
// its repetition-rule membership — so the prompt has to offer the real list.
// 'default' is excluded: it is the weight-table fallback, not a theme anyone
// would name.
function chroniclerTagVocabulary() {
  return Object.keys(EMOTIONAL_WEIGHTS).filter(t => t !== 'default');
}

// What this character already believes about the player, so the extractor can
// spend its slots on what is NEW. D8's modal answer — "nothing new was said"
// — is only expressible if the model can see what "already known" means.
// Bounded: the whole point is a cheap orientation list, not a second memory
// prompt. The enforcement is toProposalMemory's dedupe (D25), not this.
function buildChroniclerKnownBlock(npc) {
  const facts = (npc.memory?.facts || [])
    .filter(f => f && f.valid !== false && f.text)
    .slice(-FACT_DISPLAY.maxTotal)
    .map(f => `- ${f.text}`);
  const grievances = getUnresolvedGrievances(npc).map(g => `- ${g.text}`);
  let out = '';
  if (facts.length > 0) out += `\nWHAT THEY ALREADY BELIEVE (do not record any of this again):\n${facts.join('\n')}\n`;
  if (grievances.length > 0) {
    out += `\nUNRESOLVED GRIEVANCES THEY ARE CARRYING (quote the text EXACTLY to resolve one):\n${grievances.join('\n')}\n`;
  }
  return out;
}

// The rubric. Every load-bearing line is a locked decision:
//
//   D8  zero is the modal answer. Most conversations teach nobody anything,
//       and an extractor that always finds something fills BELIEF.maxFacts
//       with trivia in a week.
//   D11 a claim is not a truth. What lands is "the player SAYS X", held at a
//       confidence below certainty, because the alternative is that the
//       player lies once and the gossip layer propagates it as established.
//   D12 importance may declare that something matters and may never reach the
//       bar that makes it permanent (>= MEMORY_IMPORTANCE.significant grants
//       `pinned`, and pinned facts never evict).
//   D13 participants and emotionalTag are MANDATORY on every episode. This is
//       the cold-start fix and the whole reason Plan 5 sequences behind this.
//
// npcId is a separate parameter rather than read off the record: NPCs in
// gameState.npcs are keyed by id and do not carry one on themselves (the same
// reason findOpenQuestionTargets has to derive the caller's id by identity).
function buildChroniclerPrompt(npc, npcId, win) {
  const name = npc.bible?.name || 'this character';
  const id = npcId || 'npc_id';
  const transcript = formatWindowTranscript(win?.entries, { npcName: name });
  const tags = chroniclerTagVocabulary();

  return `You are recording what one character in a slice-of-life apartment simulation learned from talking to the player. You did NOT write this conversation — it has already happened. You are ${name}'s memory, not their voice: write nothing they would say, only what they now know.

MOST CONVERSATIONS TEACH NOBODY ANYTHING. Small talk, sorting out the dishes, a greeting, a joke that went nowhere — nothing to record. Empty lists are the correct and most common answer. Only write something down when the player actually revealed something, or something happened between them worth remembering.

WHAT ${name.toUpperCase()} HEARD (oldest first — "Player" is the person they were talking to; lines marked "(text)" arrived as text messages):
${transcript || '(nothing on record)'}
${buildChroniclerKnownBlock(npc)}
WHAT TO RECORD:

facts — things ${name} now believes, at most ${X5.maxFactsPerWindow}. Write them as ATTRIBUTED CLAIMS, not as truths: "The player says they grew up in Leeds", not "The player grew up in Leeds". ${name} heard it said; they did not verify it. Someone can lie to them, and they should be able to repeat it later as something they were told.
  - text: one sentence, third person, naming the player as "the player".
  - category: one lowercase word for what it is about — work, family, history, money, health, romance, home. Use "other" if nothing fits.
  - confidence: 0 to ${X5.factConfidenceMax}, how sure ${name} can reasonably be. ${X5.factConfidenceDefault} for an ordinary thing the player said about themselves. Higher only for something they SHOWED rather than claimed. Lower for something offhand, hedged, or possibly a joke. Never 1 — they were told, not shown.
  - importance: 0 to ${X5.factImportanceCeiling}. ${MEMORY_IMPORTANCE.social} for ordinary personal detail, ${MEMORY_IMPORTANCE.conversational} for something that would change how they see the player, ${X5.factImportanceCeiling} only for something that reframes the relationship.

episodes — at most ${X5.maxEpisodesPerWindow}: the conversation itself as a thing that happened, in one sentence, from ${name}'s side. Skip entirely if the exchange was forgettable.
  - text: what happened between them, not what was said verbatim.
  - participants: exactly ["${id}", "player"].
  - emotionalTag: REQUIRED, and one of exactly these words: ${tags.join(', ')}. Pick the one closest to how the exchange felt to ${name}. An invented word is discarded and the episode loses its meaning.

grievances — at most ${X5.maxGrievancesPerWindow}: only if the player did something in this conversation that ${name} is going to hold against them. severity 0 to 1. Rare.

resolveGrievances — the EXACT text of any grievance listed above that this conversation actually settled. Not "they were nice about it" — actually addressed, apologised for, or made right.

RESPOND WITH VALID JSON AND NOTHING ELSE:
{
  "facts": [ { "text": "The player says they grew up in Leeds", "category": "history", "confidence": ${X5.factConfidenceDefault}, "importance": ${MEMORY_IMPORTANCE.social} } ],
  "episodes": [ { "text": "They talked about where the player grew up", "participants": ["${id}", "player"], "emotionalTag": "warmth" } ],
  "grievances": [],
  "resolveGrievances": []
}

Example — they sorted out whose turn it was to buy washing powder (the ordinary case):
{ "facts": [], "episodes": [], "grievances": [], "resolveGrievances": [] }

RULES:
- Record what was SAID in this transcript. Do not infer, do not embellish, do not invent a detail to round out a fact.
- Nothing already in the believe-list above. If the conversation only repeated it, that is not a new fact.
- Do not record what ${name} said about themselves — this is their memory of the PLAYER and of what passed between them.
- Decimals for confidence and importance. Never a percentage.
- Do not explain yourself, do not add commentary, do not use markdown. JSON only.`;
}

// The call. Returns { ok, additions } where `additions` is a memoryAdditions
// proposal fragment keyed by npcId, ready for validateProposal/applyProposal
// (D4) — the same door the writer used to come through, and the reason there
// is no second ingestion path to get wrong.
//
// D14 — a failed pass is a NO-OP and this is where "failed" is decided. It
// never throws and never retries. As with the Assessor, `ok: false` and
// `ok: true` with nothing to write are different things: the second is the
// extractor correctly saying the conversation taught nobody anything (D8).
// The caller marks the window processed either way.
//
// LLM never writes state: the fragment is returned, and UI's
// runChroniclerPass hands it to NPC's applyProposal.
async function callChronicler(gameState, npcId, win) {
  const npc = gameState?.npcs?.[npcId];
  if (!npc) return { ok: false, additions: {}, reason: 'no such npc' };
  if (!win || !(win.entries || []).length) return { ok: false, additions: {}, reason: 'empty window' };
  try {
    const response = await root.generateText({
      instruction: buildChroniclerPrompt(npc, npcId, win),
      startWith: '{',
    });
    const parsed = parseChroniclerReply(response);
    if (parsed === null) {
      console.warn('Chronicler reply unparseable; window marked processed as a no-op');
      return { ok: false, additions: {}, reason: 'unparseable' };
    }
    // `npc` is passed so ingestion can drop anything this character already
    // believes (D25) — the prompt asks, this enforces.
    return {
      ok: true,
      additions: toProposalMemory(parsed, npcId, { day: gameState.meta?.clock?.day ?? 0, npc }),
    };
  } catch (e) {
    console.warn('Chronicler call failed:', e.message);
    return { ok: false, additions: {}, reason: e.message };
  }
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

    // D5 — the writer does not grade itself, and asking nicely is not the
    // enforcement. The prompt above no longer requests relationshipDeltas,
    // but a model will volunteer them from habit, and applyProposal would
    // apply them — quietly restoring the actor-grades-their-own-performance
    // loop this plan exists to break. The Assessor is the only source of
    // relationship movement from conversation now.
    proposal = stripWriterJudgement(proposal);

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
    proposal = stripWriterJudgement(proposal);   // D5 — same reason as callLLM's
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
