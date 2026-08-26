// AI-Assisted Character Generation — Phase 2: the concept engine.
//
// concept.js turns a description into a validated character draft. This pins
// the half that has no UI: the tolerant parser, the schema-driven normalizer,
// the D4 resolver hand-off, and the three adapters.
//
// The load-bearing property under test is NOT "a good reply parses". It is
// that a BAD reply degrades field by field rather than all-or-nothing — a
// rejected fill costs the player their whole description, so a hallucinated
// gender must cost them the gender and nothing else. Half these cases are
// deliberately malformed for that reason.
//
// fillFromConcept itself is not exercised here: it is a four-line wrapper
// around root.generateText, and everything it does before and after is
// covered directly below.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

const parseConceptResponse = api('parseConceptResponse');
const normalizeConceptDraft = api('normalizeConceptDraft');
const conceptToPartial = api('conceptToPartial');
const conceptToStudioDraft = api('conceptToStudioDraft');
const conceptToEditList = api('conceptToEditList');
const conceptTouchedFields = api('conceptTouchedFields');
const conceptWroteProse = api('conceptWroteProse');
const conceptEditsTouchAppearance = api('conceptEditsTouchAppearance');
const buildConceptPrompt = api('buildConceptPrompt');
const CONCEPT_SCOPES = api('CONCEPT_SCOPES');

const validateNpcField = api('validateNpcField');
const validateCharacter = api('validateCharacter');
const rollCastSlot = api('rollCastSlot');
const mergeProseIntoBible = api('mergeProseIntoBible');
const nearestPoolEntry = api('nearestPoolEntry');
const resolveAuthoredOccupationPool = api('resolveAuthoredOccupationPool');
const SCHEDULES = api('SCHEDULES');
const INTEREST_POOL = api('INTEREST_POOL');
const VALUES_POOL = api('VALUES_POOL');

// ---------------------------------------------------------------------------
// A well-formed full reply. Deliberately OFF-POOL throughout — that is the
// point of the plan (D1/D3): none of these values exist in any PHYS_POOL_* or
// QUIRKS_POOL, and all of them must survive.
// ---------------------------------------------------------------------------
const GOOD = {
  name: 'Wren', surname: 'Halloway',
  age: 29, gender: 'female', species: 'human',
  occupation: { title: 'night-shift ER nurse', category: 'health', incomeBand: 'mid', hours: 'nights', workMode: 'on_site' },
  temperament: { warmth: 0.4, volatility: -0.2, openness: 0.1, conscientiousness: 0.8, assertiveness: 0.3, selfAwareness: -0.1 },
  personality: {
    traits: ['unflappable', 'wry', 'territorial about sleep'],
    coreTrait: 'unflappable',
    hiddenTrait: 'terrified of being needed',
    quirks: ['eats dinner at 4am standing at the counter', 'apologises to furniture she bumps into'],
    likes: ['the smell of a laundromat', 'empty buses', 'other people\'s dogs'],
    dislikes: ['being thanked', 'daylight before noon', 'group texts'],
  },
  speech: {
    verbosity: 0.3, formality: 0.4, profanityLevel: 0.6, vocabularyLevel: 0.7,
    humorStyle: 'gallows', textingStyle: 'lowercase, no punctuation',
    verbalTics: ['"sure."'], catchphrases: [],
  },
  interests: ['restoring dead synthesizers', 'cooking'],
  values: [{ name: 'competence', opposition: 'asking for help' }, { name: 'loyalty', opposition: 'freedom' }],
  baggage: 'Four years on a ward that closed under her.',
  wound: 'Nobody came to the hospital when it was her turn.',
  want: 'To sleep through one whole night without her phone on.',
  blindSpot: 'She thinks she is the calm one.',
  boundary: 'Never talks about the year she lost.',
  physical: {
    height: 'tall', build: 'wiry',
    hair: { color: 'dyed lavender, badly grown out', style: 'shoved up in a claw clip', length: 'past the shoulders', texture: 'fine' },
    eyes: { color: 'pale grey-green', shape: 'hooded' },
    skin: { tone: 'washed-out', texture: 'freckled', ethnicity: 'Northern European' },
    face: { shape: 'narrow', nose: 'straight', lips: 'thin', cheekbones: 'sharp', jawline: 'soft', ears: 'small' },
    body: { shape: 'rectangle', chestSize: 'small', buttSize: 'flat', legs: 'long', posture: 'slouched' },
    distinguishingFeatures: ['a badge-clip tan line', 'bitten nails'],
    piercings: [{ location: 'earlobe', type: 'small gold hoop', description: 'never taken out' }],
    tattoos: [{ location: 'inner forearm', style: 'stick and poke', description: 'a crooked lighthouse' }],
    facialHair: '', fashion: 'scrubs and whatever was on the chair',
    accessories: 'a dead watch she never winds',
    voice: { pitch: 'low', texture: 'sandpapery', accent: 'flattened Boston, mostly worn off' },
    gait: 'walks like she is late', scent: 'hand sanitiser and clean laundry',
  },
  history: 'She took the room because it was close to the hospital and cheap enough that she could stop counting. Four years on a ward that closed under her left her good at triage and bad at rest.',
  sketch: 'Unflappable night nurse who cannot sit still in a quiet room.',
  sampleLines: ['"It\'s fine. I\'ve seen worse."', '"Don\'t thank me."', '"You\'re up early. Or late. Which."'],
};

console.log('\n--- 1. Parsing ---');

check('clean JSON parses', !!parseConceptResponse(JSON.stringify(GOOD)));
check('markdown-fenced JSON parses',
  parseConceptResponse('```json\n' + JSON.stringify(GOOD) + '\n```')?.name === 'Wren');
check('leading commentary is skipped',
  parseConceptResponse('Sure! Here you go:\n' + JSON.stringify(GOOD))?.name === 'Wren');
check('trailing commentary is skipped',
  parseConceptResponse(JSON.stringify(GOOD) + '\n\nHope that helps!')?.name === 'Wren');
check('empty string returns null', parseConceptResponse('') === null);
check('non-string returns null', parseConceptResponse(null) === null);
check('prose with no JSON returns null', parseConceptResponse('I cannot help with that.') === null);
check('a bare JSON array returns null (must be an object)', parseConceptResponse('[1,2,3]') === null);

// The truncation case the old `stopSequences: ['}\n']` actively caused.
const pretty = JSON.stringify(GOOD, null, 2);
const cutMidPhysical = pretty.slice(0, pretty.indexOf('"face"') + 40);
const recovered = parseConceptResponse(cutMidPhysical);
check('a reply truncated mid-appearance still recovers an object', !!recovered);
check('  ...and keeps the fields that arrived before the cut',
  recovered && recovered.name === 'Wren' && recovered.occupation?.title === 'night-shift ER nurse',
  recovered ? `name=${recovered.name} occ=${recovered.occupation?.title}` : 'no object');
check('  ...and recovers the completed part of the truncated subtree',
  recovered && recovered.physical && recovered.physical.hair?.color === 'dyed lavender, badly grown out',
  JSON.stringify(recovered && recovered.physical && Object.keys(recovered.physical)));

const cutMidString = pretty.slice(0, pretty.indexOf('badly grown out'));
check('a reply cut mid-string still recovers an object', !!parseConceptResponse(cutMidString));

console.log('\n--- 2. Normalizing a good reply (npcFull) ---');

const draft = normalizeConceptDraft(GOOD, 'npcFull');

check('name/age/gender survive', draft.name === 'Wren' && draft.age === 29 && draft.gender === 'female');
check('surname survives', draft.surname === 'Halloway');
check('off-pool hair colour survives verbatim', draft.physical?.hair?.color === 'dyed lavender, badly grown out');
check('off-pool fashion survives verbatim', draft.physical?.fashion === 'scrubs and whatever was on the chair');
check('off-pool quirks survive verbatim',
  draft.personality?.quirks?.includes('eats dinner at 4am standing at the counter'));
check('off-pool trait survives verbatim', draft.personality?.traits?.includes('territorial about sleep'));
check('narrative fields survive', draft.wound === GOOD.wound && draft.boundary === GOOD.boundary);
check('temperament axes survive as numbers', draft.temperament?.conscientiousness === 0.8);
check('speech numbers survive', draft.speech?.profanityLevel === 0.6);
check('off-pool humorStyle survives', draft.speech?.humorStyle === 'gallows');
check('piercing rows survive as objects',
  Array.isArray(draft.physical?.piercings) && draft.physical.piercings[0].type === 'small gold hoop');
check('tattoo rows survive as objects',
  Array.isArray(draft.physical?.tattoos) && draft.physical.tattoos[0].style === 'stick and poke');
check('distinguishing features survive', draft.physical?.distinguishingFeatures?.length === 2);
check('prose survives', !!draft.history && !!draft.sketch && draft.sampleLines?.length === 3);

// D4 hand-off.
check('off-pool interest keeps its name', draft.interests?.some(i => i.name === 'restoring dead synthesizers'));
check('off-pool interest gets an empty tag list rather than being dropped',
  Array.isArray(draft.interests?.find(i => i.name === 'restoring dead synthesizers')?.tags));
check('pool interest still borrows its real tags',
  (draft.interests?.find(i => i.name === 'cooking')?.tags || []).length > 0);
check('off-pool value keeps the model\'s own opposition',
  draft.values?.find(v => v.name === 'competence')?.opposition === 'asking for help');
check('pool value keeps its authored opposition',
  draft.values?.find(v => v.name === 'loyalty')?.opposition === 'freedom');

// Skipped subtrees (concept.js's CONCEPT_PHYSICAL_SKIP).
check('heightBuild is never generated (it is a derived cache)', draft.physical?.heightBuild === undefined);
check('intimate is never generated', draft.physical?.intimate === undefined);
check('typicalAttire is never generated (reserved, no reader)', draft.physical?.typicalAttire === undefined);

console.log('\n--- 3. Every normalized path is schema-legal ---');

let badPath = null;
const walkCheck = (obj, prefix) => {
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_touched') continue;
    const path = `${prefix}.${k}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) { walkCheck(v, path); continue; }
    if (['bible.physical.piercings', 'bible.physical.tattoos'].includes(path)) continue;  // row arrays, see concept.js
    const r = validateNpcField(path, v);
    if (!r.ok && !badPath) badPath = `${path}: ${r.error}`;
  }
};
for (const key of ['name', 'surname', 'age', 'gender', 'species', 'baggage', 'wound', 'want', 'blindSpot', 'boundary', 'history', 'sketch']) {
  const r = validateNpcField(`bible.${key}`, draft[key]);
  if (!r.ok && !badPath) badPath = `bible.${key}: ${r.error}`;
}
walkCheck(draft.physical || {}, 'bible.physical');
walkCheck(draft.temperament || {}, 'bible.temperament');
check('every normalized scalar passes validateNpcField', badPath === null, badPath);
check('normalized interests pass validateNpcField', validateNpcField('bible.interests', draft.interests).ok);
check('normalized values pass validateNpcField', validateNpcField('bible.values', draft.values).ok);
check('normalized sampleLines pass validateNpcField', validateNpcField('bible.sampleLines', draft.sampleLines).ok);

console.log('\n--- 4. A hostile reply degrades field by field, never all-or-nothing ---');

const BAD = {
  name: '   Wren   ',                         // whitespace — trimmed, kept
  age: 12,                                    // below the floor — CLAMPED to 18
  gender: 'agender',                          // not in the enum — dropped
  species: 'goblin',                          // not in the enum — dropped
  temperament: { warmth: 4.5, volatility: 'very', openness: 0.2 },  // clamp / drop / keep
  speech: { verbosity: -3, humorStyle: 42 },  // clamp / drop
  personality: { traits: 'sarcastic', quirks: ['ok', '', null, 'ok'], coreTrait: 'wry', hiddenTrait: 'wry' },
  interests: 'gaming',                        // wrong type — dropped
  values: [{ name: 'competence' }],           // missing opposition — derived
  wound: 'x'.repeat(900),                     // over maxLength — truncated
  physical: { hair: { color: 'teal', style: 12 }, eyes: 'green', build: '   ' },
  sampleLines: 'just one line',               // wrong type — dropped
};
const bad = normalizeConceptDraft(BAD, 'npcFull');

check('whitespace-padded name is trimmed and kept', bad.name === 'Wren');
check('an under-age number CLAMPS to the schema floor rather than dropping', bad.age === 18, `age=${bad.age}`);
check('a hallucinated gender is dropped', bad.gender === undefined);
check('a hallucinated species is dropped', bad.species === undefined);
check('an out-of-range temperament axis clamps', bad.temperament?.warmth === 1);
check('a non-numeric temperament axis is dropped', bad.temperament?.volatility === undefined);
check('a good sibling axis survives its bad neighbours', bad.temperament?.openness === 0.2);
check('a negative speech scalar clamps to 0', bad.speech?.verbosity === 0);
check('a non-string humorStyle is dropped', bad.speech?.humorStyle === undefined);
check('a string where an array belongs is dropped (traits)', bad.personality?.traits === undefined);
check('empty and null array entries are stripped', JSON.stringify(bad.personality?.quirks) === JSON.stringify(['ok']));
check('a hiddenTrait duplicating a visible trait is dropped', bad.personality?.hiddenTrait === undefined);
check('a string where an array belongs is dropped (interests)', bad.interests === undefined);
check('a value with no opposition still gets one (schema-required)',
  !!bad.values?.[0]?.opposition, JSON.stringify(bad.values));
check('an over-long string is truncated to maxLength', bad.wound?.length === 300, `len=${bad.wound?.length}`);
check('a good physical leaf survives its bad siblings', bad.physical?.hair?.color === 'teal');
check('a non-string physical leaf is dropped', bad.physical?.hair?.style === undefined);
check('a scalar where an object belongs is dropped', bad.physical?.eyes === undefined);
check('a whitespace-only value is dropped', bad.physical?.build === undefined);
check('a string where an array belongs is dropped (sampleLines)', bad.sampleLines === undefined);
check('the hostile reply STILL produced a usable draft', bad._touched.length > 0, `touched=${bad._touched.length}`);

check('a null reply yields an empty draft, not a throw',
  JSON.stringify(normalizeConceptDraft(null, 'npcFull')) === '{"_touched":[]}');
check('an unknown scope yields an empty draft, not a throw',
  JSON.stringify(normalizeConceptDraft(GOOD, 'nope')) === '{"_touched":[]}');
check('an array reply yields an empty draft', normalizeConceptDraft([1, 2], 'npcFull')._touched.length === 0);

console.log('\n--- 5. Scopes ---');

const playerDraft = normalizeConceptDraft(GOOD, 'player');
check('player scope keeps name and appearance', !!playerDraft.name && !!playerDraft.physical);
check('player scope does NOT assign a personality', playerDraft.personality === undefined);
check('player scope does NOT assign a wound', playerDraft.wound === undefined);
check('player scope does NOT assign an occupation', playerDraft.occupation === undefined);

const lookDraft = normalizeConceptDraft(GOOD, 'npcAppearance');
check('appearance scope keeps physical', !!lookDraft.physical);
check('appearance scope drops name', lookDraft.name === undefined);
check('appearance scope drops age', lookDraft.age === undefined);
check('appearance scope touches only physical paths',
  lookDraft._touched.every(p => p.startsWith('physical')), JSON.stringify(lookDraft._touched.slice(0, 5)));

check('every scope in the table builds a prompt without throwing',
  Object.keys(CONCEPT_SCOPES).every(s => typeof buildConceptPrompt('a shy barista', s, {}) === 'string'));
const npcPrompt = buildConceptPrompt('a shy barista', 'npcFull', {});
check('the prompt names appearance fields from the schema', npcPrompt.includes('cheekbones'));
check('the prompt does NOT dump the quirks pool (D3)',
  !npcPrompt.includes('always hums while cooking'), 'QUIRKS_POOL leaked into the prompt');
check('the prompt does NOT dump the traits pool (D3)',
  !npcPrompt.includes('passive-aggressive, protective, manipulative'), 'PERSONALITY_TRAITS_POOL leaked');
check('the prompt names the real gender enum', npcPrompt.includes('trans_female'));
check('the prompt does not ask for intimate anatomy', !npcPrompt.includes('genitals'));
check('the prompt carries the player\'s description', npcPrompt.includes('a shy barista'));
const ctxPrompt = buildConceptPrompt('x', 'npcFull', { authored: { name: 'Del' }, usedNames: ['Mira', 'Wren'] });
check('already-authored values are shown to the model', ctxPrompt.includes('name: Del'));
check('used names are shown to the model', ctxPrompt.includes('Mira'));

console.log('\n--- 6. authoredFields (D9) ---');

const authored = conceptTouchedFields(draft);
check('authoredFields collapses physical.* to one prefix',
  authored.filter(a => a.startsWith('physical')).length === 1, JSON.stringify(authored.filter(a => a.startsWith('physical'))));
check('authoredFields collapses temperament.* to one prefix',
  authored.filter(a => a.startsWith('temperament')).length === 1);
check('authoredFields names occupation as one entry', authored.includes('occupation'));
check('authoredFields carries the scalars', ['name', 'age', 'gender', 'wound', 'boundary'].every(k => authored.includes(k)));
check('authoredFields has no duplicates', new Set(authored).size === authored.length);
check('portraitPrompt never reaches authoredFields (no bible counterpart)',
  !conceptTouchedFields(normalizeConceptDraft({ ...GOOD, portraitPrompt: 'a face' }, 'player')).includes('portraitPrompt'));
check('conceptWroteProse is true when prose was written', conceptWroteProse(draft) === true);
check('conceptWroteProse is false for an appearance-only fill', conceptWroteProse(lookDraft) === false);

console.log('\n--- 7. Adapters ---');

const partial = conceptToPartial(draft);
check('partial strips _touched (plan invariant 4)', partial._touched === undefined);
check('partial flattens interests to name strings (the sandbox controls read these)',
  Array.isArray(partial.interests) && typeof partial.interests[0] === 'string');
check('partial flattens values to name strings',
  Array.isArray(partial.values) && typeof partial.values[0] === 'string');
check('partial carries the job title as occupationCategory',
  partial.occupationCategory === 'night-shift ER nurse');
check('partial carries the model\'s occupation hints', partial.occupationOverrides?.hours === 'nights');
check('partial deep-copies physical (no shared reference with the draft)',
  partial.physical !== draft.physical && partial.physical.hair !== draft.physical.hair);

const studioDraft = conceptToStudioDraft(draft);
check('studio draft strips _touched', studioDraft._touched === undefined);
check('studio draft adds personality', !!studioDraft.personality);
check('studio draft adds speech', !!studioDraft.speech);
check('studio draft adds prose', !!studioDraft.history && !!studioDraft.sketch);

console.log('\n--- 8. The draft survives the REAL roll path ---');

const rolled = rollCastSlot(4242, 0, 'npc_concept', 'a', new Set(), [], partial);
check('rollCastSlot accepts a concept partial', !!rolled);
const bible = rolled.normalized.bible;
check('the rolled bible validates', validateCharacter({ bible }).valid);
check('the off-pool hair colour reached the bible', bible.physical.hair.color === 'dyed lavender, badly grown out');
check('the novel job title reached the bible', bible.occupation.title === 'night-shift ER nurse');
check('the novel job still has a REAL schedule template',
  Object.prototype.hasOwnProperty.call(SCHEDULES, bible.occupation.scheduleTemplate),
  `scheduleTemplate=${bible.occupation.scheduleTemplate}`);
check('the model\'s hours override won', bible.occupation.hours === 'nights');
check('the model\'s incomeBand override won', bible.occupation.incomeBand === 'mid');
check('scheduleTemplate is NEVER overridable (D2b)',
  rollCastSlot(4242, 0, 'npc_x', 'a', new Set(), [],
    { ...partial, occupationOverrides: { ...partial.occupationOverrides, scheduleTemplate: 'not_a_real_key' } }
  ).normalized.bible.occupation.scheduleTemplate !== 'not_a_real_key');
check('heightBuild is derived, not generated',
  bible.physical.heightBuild === `${bible.physical.height} and ${bible.physical.build}`);
check('the off-pool interest reached the bible', bible.interests.some(i => i.name === 'restoring dead synthesizers'));
check('the off-pool value reached the bible', bible.values.some(v => v.name === 'competence'));
check('every bible value has a non-empty opposition', bible.values.every(v => !!v.opposition));

// The authored lock: the prose pass must not overwrite what the fill wrote.
const clobber = {
  name: 'CLOBBER', surname: 'CLOBBER', visual: 'CLOBBER', history: 'CLOBBER', sketch: 'CLOBBER',
  sampleLines: ['CLOBBER'], physical: { hair: { color: 'CLOBBER' }, fashion: 'CLOBBER' },
};
const merged = mergeProseIntoBible(bible, clobber, authored);
check('mergeProseIntoBible cannot overwrite a concept-filled appearance',
  merged.physical.hair.color === 'dyed lavender, badly grown out');
check('mergeProseIntoBible cannot overwrite a concept-filled name', merged.name === 'Wren');
check('the merged bible still validates', validateCharacter({ bible: merged }).valid);

console.log('\n--- 9. conceptToEditList (feeds Phase 6) ---');

// Since Phase 5, rollCastSlot honours personality, speech and prose in a
// partial too, so a bible rolled FROM this draft should already agree with it
// almost everywhere. What legitimately still differs is the two fields the
// roller enriches: `interests` gains a rolled `skill`, and an exact-pool
// `value` takes the pool's authored opposition over the model's.
const npc = { bible: JSON.parse(JSON.stringify(bible)) };
const rollEdits = conceptToEditList(draft, npc);
check('prose reaches the bible through the partial (no edit needed)',
  !rollEdits.some(e => ['bible.history', 'bible.sketch', 'bible.sampleLines'].includes(e.path)),
  JSON.stringify(rollEdits.map(e => e.path)));
check('personality and speech reach the bible through the partial',
  !rollEdits.some(e => e.path.startsWith('bible.personality') || e.path.startsWith('bible.speech')),
  JSON.stringify(rollEdits.map(e => e.path)));
check('identity and appearance are skipped as no-ops',
  !rollEdits.some(e => ['bible.name', 'bible.age', 'bible.gender', 'bible.wound'].includes(e.path))
  && !rollEdits.some(e => e.path.startsWith('bible.physical')),
  JSON.stringify(rollEdits.map(e => e.path)));
check('only the roller-enriched fields remain',
  JSON.stringify(rollEdits.map(e => e.path).sort()) === JSON.stringify(['bible.interests', 'bible.values']),
  JSON.stringify(rollEdits.map(e => e.path)));

// The real idempotence property: apply the whole list once, and a second pass
// must produce nothing. This is what stops a rewrite fabricating a
// bibleRevision every time it is opened.
function applyEditPath(obj, path, value) {
  const segs = String(path).split('.');
  let node = obj;
  for (const s of segs.slice(0, -1)) node = (node[s] = node[s] || {});
  node[segs[segs.length - 1]] = JSON.parse(JSON.stringify(value));
}
const applied = { bible: JSON.parse(JSON.stringify(bible)) };
for (const e of conceptToEditList(draft, null)) applyEditPath(applied, e.path, e.value);
check('applying the full edit list is idempotent (a second pass is empty)',
  conceptToEditList(draft, applied).length === 0,
  JSON.stringify(conceptToEditList(draft, applied).map(e => e.path)));

const changed = JSON.parse(JSON.stringify(draft));
changed.physical.hair.color = 'grown out to the roots';
changed.wound = 'A different wound entirely.';
const edits = conceptToEditList(changed, applied);
check('an edit list picks up exactly what changed', edits.length === 2, JSON.stringify(edits.map(e => e.path)));
check('edit paths are real schema paths', edits.every(e => validateNpcField(e.path, e.value).ok),
  JSON.stringify(edits.map(e => `${e.path}=${validateNpcField(e.path, e.value).ok}`)));
check('an appearance edit is detected for the genSeed bump (D14)', conceptEditsTouchAppearance(edits) === true);
check('a prose-only edit is NOT flagged as appearance',
  conceptEditsTouchAppearance([{ path: 'bible.wound', value: 'x' }]) === false);
check('an edit list with no npc returns every field', conceptToEditList(draft, null).length > 20);
check('conceptToEditList never writes scheduleTemplate (D2b)',
  !conceptToEditList(draft, null).some(e => e.path === 'bible.occupation.scheduleTemplate'));
check('conceptToEditList never writes _touched', !conceptToEditList(draft, null).some(e => e.path.includes('_touched')));

console.log('\n--- 10. D4 resolvers, pinned directly ---');

check('nearestPoolEntry: exact match', nearestPoolEntry('cooking', INTEREST_POOL, i => i.name)?.name === 'cooking');
check('nearestPoolEntry: substring match',
  nearestPoolEntry('late night cooking', INTEREST_POOL, i => i.name)?.name === 'cooking');
check('nearestPoolEntry: no match returns null',
  nearestPoolEntry('xylophone repair', VALUES_POOL, v => v.name) === null);
check('nearestPoolEntry: empty text returns null', nearestPoolEntry('', INTEREST_POOL, i => i.name) === null);
check('nearestPoolEntry: empty pool returns null', nearestPoolEntry('cooking', [], i => i.name) === null);
check('nearestPoolEntry is case/punctuation insensitive',
  nearestPoolEntry('  COOKING!  ', INTEREST_POOL, i => i.name)?.name === 'cooking');

// A job with no near neighbour returns `pool: null` — meaning "no constraint,
// draw from the whole pool". That is deliberately better than pinning a fixed
// default entry: the unconstrained draw still runs occupationAffinity, so the
// character gets a schedule that suits the temperament the same fill just
// wrote, while keeping the player's words as the title.
const novelOcc = resolveAuthoredOccupationPool('competitive bread judge');
check('a novel job keeps the typed title', novelOcc.title === 'competitive bread judge');
check('a novel job with no near neighbour leaves the draw unconstrained', novelOcc.pool === null);
check('a real category resolves without overriding the title',
  resolveAuthoredOccupationPool('tech').title === null);
check('a real category constrains the draw to that category',
  resolveAuthoredOccupationPool('tech').pool.every(o => o.category === 'tech'));

// A job that DOES have a near neighbour borrows exactly one entry's machinery.
const nearOcc = resolveAuthoredOccupationPool('night-shift ER nurse');
check('a near-miss job resolves to a single pool entry', nearOcc.pool?.length === 1);
check('a near-miss job still keeps the typed title', nearOcc.title === 'night-shift ER nurse');
check('every resolved candidate carries a real SCHEDULES key',
  [...nearOcc.pool, ...resolveAuthoredOccupationPool('tech').pool]
    .every(o => Object.prototype.hasOwnProperty.call(SCHEDULES, o.scheduleTemplate)));
check('an empty occupation string resolves to nothing',
  resolveAuthoredOccupationPool('').pool === null && resolveAuthoredOccupationPool('').title === null);

// run-all.js matches /^ {2}(\d+) passed, (\d+) failed$/m — the two leading
// spaces are load-bearing. Without them the harness runs green standalone and
// is silently counted as "errored" by the suite.
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
