// Player creation + the opening cutscene.
//
// The invariants here are mostly about AGREEMENT between tables that were
// deliberately kept separate: the studio's field list vs CHARACTER_SCHEMA,
// GENITAL_TYPE_FIELDS vs the schema's union `itemFields`, the gender enum vs
// the default-genitals map. Each pair could drift silently — a form offering
// a value the validator rejects is invisible until a player picks it.
//
// The gate on physical.intimate gets the most attention, because it is the
// one thing in this plan that can be wrong in a way nobody notices: every
// safety property is satisfied perfectly by a gate that never opens, so the
// negative cases are asserted one condition at a time AND the positive case
// is asserted too.
const { loadEngine } = require('./loadgame.js');
const { api, ctx } = loadEngine({ required: ['config.js', 'sim.js', 'npc.js', 'state.js', 'studio.js', 'defs.intro.js'] });
const vm = require('vm');
const run = (src) => vm.runInContext(src, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

const SCHEMA = api('CHARACTER_SCHEMA');
const GTF = api('GENITAL_TYPE_FIELDS');
const GENDERS = Object.keys(api('CHAR_GEN.genderWeights'));

// ---------------------------------------------------------------- 1
console.log('\n1. Schema/generator/studio agreement');

// Every studio field that claims a schema address must actually resolve to
// one. This is the check that catches a renamed schema key: the studio would
// go on offering the field and validateStudioField would start rejecting
// every value the player picked.
const badPaths = api(`
  (() => {
    const bad = [];
    for (const tab of PLAYER_STUDIO_TABS)
      for (const sec of tab.sections)
        for (const f of sec.fields) {
          if (!f.schemaPath) continue;
          const r = validateNpcField(f.schemaPath, '');
          if (r.error && /Unknown field|Not an array|no item schema/.test(r.error)) bad.push(f.path + ' -> ' + f.schemaPath);
        }
    return bad;
  })()
`);
check('every studio schemaPath resolves in CHARACTER_SCHEMA', badPaths.length === 0, badPaths.join('\n        '));

// And the other direction that actually matters: every value the studio can
// OFFER must be one the validator accepts. A pool and an enum drifting apart
// is the exact bug this pairing exists to prevent.
const rejected = api(`
  (() => {
    const bad = [];
    for (const tab of PLAYER_STUDIO_TABS)
      for (const sec of tab.sections)
        for (const f of sec.fields) {
          if (!f.schemaPath || !f.pool) continue;
          for (const v of f.pool()) {
            const r = validateNpcField(f.schemaPath, v);
            if (!r.ok) bad.push(f.schemaPath + ' rejects "' + v + '": ' + r.error);
          }
        }
    return bad;
  })()
`);
check('every value a studio pool offers passes validateNpcField', rejected.length === 0, rejected.slice(0, 4).join('\n        '));

// Every key GENITAL_TYPE_FIELDS names must exist in the schema's union, or
// normalizeGenitals would strip a field the studio just collected.
const genitalItemFields = SCHEMA.bible.physical.fields.intimate.fields.genitals.itemFields;
const missingKeys = [];
for (const [type, fields] of Object.entries(GTF)) {
  for (const key of Object.keys(fields)) {
    if (!(key in genitalItemFields)) missingKeys.push(`${type}.${key}`);
  }
}
check('every GENITAL_TYPE_FIELDS key is in the schema union', missingKeys.length === 0, missingKeys.join(', '));

// ...and nothing in the union is orphaned — a key no type claims would be
// validated forever and never written, which is the dead-field shape RI6
// exists to catch.
const claimed = new Set(['type']);
for (const fields of Object.values(GTF)) for (const k of Object.keys(fields)) claimed.add(k);
const orphans = Object.keys(genitalItemFields).filter(k => !claimed.has(k));
check('no schema union key is unclaimed by any type', orphans.length === 0, orphans.join(', '));

// A round-trip through the validator then the normalizer must be lossless
// for a well-formed row, and must strip the default-filled foreign keys.
check('validate→normalize round-trip is lossless and strips foreign keys', api(`
  (() => {
    const row = { type: 'vagina', labia: 'plush', color: 'rosy', hair: 'bare', sensitivity: 'high', description: 'x' };
    const v = validateNpcField('bible.physical.intimate.genitals[0]', row);
    if (!v.ok) return false;
    if (!('girth' in v.value)) return false;              // union default-fills it
    const n = normalizeGenitals([v.value])[0];
    if ('girth' in n) return false;                        // normalizer takes it back out
    return Object.keys(GENITAL_TYPE_FIELDS.vagina).every(k => n[k] === row[k]);
  })()
`));

// ---------------------------------------------------------------- 2
console.log('\n2. Gender → genitals is total');

for (const g of GENDERS) {
  const res = api(`(() => {
    const rng = seededRng(12345, 'g_${g}');
    const out = generateIntimate(rng, '${g}');
    return { n: out.genitals.length, types: out.genitals.map(x => x.type),
             wellFormed: out.genitals.every(x => GENITAL_TYPE_FIELDS[x.type]
               && Object.keys(GENITAL_TYPE_FIELDS[x.type]).every(k => typeof x[k] === 'string')) };
  })()`);
  check(`${g.padEnd(13)} → ${res.types.join('+') || '(none)'}`, res.n > 0 && res.wellFormed);
}
check('futanari carries two DISTINCT types',
      api(`(() => { const g = generateIntimate(seededRng(1,'f'), 'futanari').genitals;
                    return g.length === 2 && g[0].type !== g[1].type; })()`));
// The map must cover the enum exactly — a gender with no row would silently
// fall back to the female default and nobody would notice.
const uncovered = GENDERS.filter(g => !(g in api('GENDER_DEFAULT_GENITALS')));
check('GENDER_DEFAULT_GENITALS covers every gender in the enum', uncovered.length === 0, uncovered.join(', '));
check('an unknown gender falls back to a body, not to nothing',
      api(`generateIntimate(seededRng(1,'u'), 'not_a_gender').genitals.length > 0`));

// Every character carries the group — the producer half of RI6. Asserted over
// a whole house rather than over rollCastSlot's output, because a generated
// cast is NOT the only way an NPC is made: this originally failed on Del
// Connors, whose bible is hand-authored in config and never touches the
// roller. The guarantee therefore lives in createNpcFromBible (ensureIntimate)
// — the one gate every construction path returns through — and the two checks
// below are the two halves of that claim.
const wellFormed = `(npc) => {
  const it = npc && npc.bible && npc.bible.physical && npc.bible.physical.intimate;
  return !!it && Array.isArray(it.genitals) && it.genitals.length > 0
      && !!it.breasts && !!it.breasts.size && !!it.bodyHair;
}`;
check('every NPC of a generated house has one — INCLUDING the authored contractor', api(`
  (() => {
    const ok = ${wellFormed};
    const h = SIM_generateHouse('introcast', 4, []);
    if (!h.npcs[CONTRACTOR_ID]) return false;   // the case that caught this
    return Object.values(h.npcs).every(ok);
  })()
`));
check('an authored bible with no intimate group gets one through the gate', api(`
  (() => {
    const ok = ${wellFormed};
    return ok(createNpcFromBible(JSON.parse(JSON.stringify(CONTRACTOR_BIBLE)), 'visitor'));
  })()
`));
// The claim is precisely "a bible that HAS a physical record has an intimate
// group" — not "every bible has a body". createExternalNpc builds its bible
// with no `physical` key at all (a delivery driver has never had one; the
// describer falls back to 'a young adult'). That predates this plan and
// inventing bodies for walk-on characters is not its job — but the boundary
// is asserted so the day someone gives externals a physical record, this
// check tells them the intimate group has to come with it.
check('a bible with NO physical record is passed through, not invented into', api(`
  (() => {
    const b = { genSeed: 3, gender: 'female' };
    const out = ensureIntimate(b);
    return out === b && !out.physical;
  })()
`));
check('an external NPC still has no physical record (pre-existing, documented)', api(`
  (() => {
    const h = SIM_generateHouse('paths', 1, []);
    const gs = { meta: { seed: h.seed, clock: h.clock }, npcs: h.npcs, world: h.world, objects: h.objects, player: h.player };
    const ext = createExternalNpc(gs, 'ext_test', 'ext_test', 'Delivery Driver');
    return !ext.bible.physical && /a young adult/.test(getPhysicalDescriptionForPrompt(ext));
  })()
`));
check('ensureIntimate is idempotent — an existing group is never rerolled', api(`
  (() => {
    const b = { genSeed: 42, gender: 'female', physical: { hair: {} } };
    const once = ensureIntimate(b);
    const twice = ensureIntimate(once);
    return JSON.stringify(once.physical.intimate) === JSON.stringify(twice.physical.intimate);
  })()
`));

// ---------------------------------------------------------------- 3
console.log('\n3. The gate holds — each condition independently');

run(`
  var __h = SIM_generateHouse('gate', 2, []);
  var __npc = __h.npcs[__h.npcIds[0]];
  var __on  = { meta: { contentConfig: { contentFlags: { mature: true  } } } };
  var __off = { meta: { contentConfig: { contentFlags: { mature: false } } } };
  __npc.clothing = 'undressed';
  var __base    = getPhysicalDescriptionForPrompt(__npc);
  var __open    = getPhysicalDescriptionForPrompt(__npc, { intimate: true, gameState: __on });
  var __noOpt   = getPhysicalDescriptionForPrompt(__npc, { gameState: __on });
  var __noState = getPhysicalDescriptionForPrompt(__npc, { intimate: true });
  var __noFlag  = getPhysicalDescriptionForPrompt(__npc, { intimate: true, gameState: __off });
  __npc.clothing = 'dressed';
  var __dressedGated = getPhysicalDescriptionForPrompt(__npc, { intimate: true, gameState: __on });
  var __dressedPlain = getPhysicalDescriptionForPrompt(__npc);
`);
check('cond 1 off (no opts.intimate) — byte-identical to before', api('__base === __noOpt'));
check('cond 2 fails CLOSED when no gameState is supplied', api('__base === __noState'));
check('cond 2 off (mature:false) — byte-identical', api('__base === __noFlag'));
check('cond 3 off (dressed) — byte-identical', api('__dressedGated === __dressedPlain'));
check('all three on — the gate actually OPENS', api('__open !== __base && __open.length > __base.length'));
check('what it opens mentions genitals and breasts',
      api(`/vagina|penis/.test(__open) && /breasts/.test(__open)`),
      api('__open.slice(__base.length - 1)').trim().slice(0, 120));

// The whole point of nesting: ordinary call sites are untouched. Sample the
// real ones rather than trusting the default-parameter reading.
check('buildCharacterPrompt (NPC portraits) leaks nothing', api(`
  (() => { __npc.clothing = 'undressed';
           const p = buildCharacterPrompt(__npc, 'neutral', 'standing');
           return !/vagina|penis|areola|nipple/.test(p); })()
`));
check('buildPlayerPortraitPrompt leaks nothing', api(`
  (() => { const d = { age: 25, gender: 'futanari',
                       physical: __h.player.appearance.physical };
           return !/vagina|penis|areola|nipple/.test(buildPlayerPortraitPrompt(d)); })()
`));

// ---------------------------------------------------------------- 4
console.log('\n4. Authored beats rolled, and reaches the prose');

run(`
  var __authored = SIM_generateHouse('authored', 0, [], {
    name: 'Wren', surname: 'Ashcombe', gender: 'futanari', age: 31,
    physical: {
      build: 'athletic',
      hair: { color: 'dyed pink' },
      intimate: {
        breasts: { size: 'small' },
        genitals: [{ type: 'penis', length: 'long', girth: 'thick', bogus: 'nope' }],
      },
    },
    portrait: { prompt: 'my own words', seed: 7, promptDirty: true },
  }).player;
`);
check('authored name and surname survive', api(`__authored.name === 'Wren' && __authored.surname === 'Ashcombe'`));
check('a blank name ROLLS rather than staying empty',
      api(`(() => { const p = SIM_generateHouse('blank', 0, []).player;
                    return !!p.name && !!p.surname; })()`));
check('a rolled name is deterministic for a seed',
      api(`(() => { const a = SIM_generateHouse('detname', 0, []).player;
                    const b = SIM_generateHouse('detname', 0, []).player;
                    return a.name === b.name && a.surname === b.surname; })()`));
// The bug verify-meal.js already guards, re-asserted because the merge moved.
check('authored build reaches the DERIVED heightBuild',
      api(`/athletic/.test(__authored.appearance.physical.heightBuild)`),
      api('__authored.appearance.physical.heightBuild'));
check('authored hair colour merges without dropping rolled siblings',
      api(`__authored.appearance.physical.hair.color === 'dyed pink' && !!__authored.appearance.physical.hair.length`));
check('breasts MERGE (authored size, rolled shape kept)',
      api(`__authored.appearance.physical.intimate.breasts.size === 'small'
           && !!__authored.appearance.physical.intimate.breasts.shape`));
// The asymmetry that matters: an object merges, an array replaces. A futanari
// rolls two entries; the authored list of one must win outright, or a player
// who deliberately removed a part gets it handed back.
check('genitals REPLACE rather than union (futanari + one authored entry = one)',
      api(`__authored.appearance.physical.intimate.genitals.length === 1
           && __authored.appearance.physical.intimate.genitals[0].type === 'penis'`));
check('an authored genital row is normalized (foreign key dropped, gaps filled)',
      api(`(() => { const g = __authored.appearance.physical.intimate.genitals[0];
                    return !('bogus' in g) && g.length === 'long' && g.cut === ''; })()`));
check('the portrait record carries through untouched',
      api(`__authored.portrait.prompt === 'my own words' && __authored.portrait.promptDirty === true`));
check('a hand-edited prompt is what buildPlayerDraftForNewGame keeps', api(`
  (() => {
    playerStudioDraft = blankPlayerDraft();
    playerStudioDraft.portrait = { prompt: 'mine', seed: 1, promptDirty: true };
    playerStudioDraft.physical = { intimate: { genitals: [{ type: 'penis', bogus: 1 }] } };
    const d = buildPlayerDraftForNewGame();
    playerStudioDraft = null;
    return d.portrait.prompt === 'mine' && d.portrait.promptDirty === true
        && !('bogus' in d.physical.intimate.genitals[0]);
  })()
`));

// ---------------------------------------------------------------- 5
console.log('\n5. Migration round-trip');

check('a pre-migration NPC gains intimate, deterministically', api(`
  (() => {
    const mk = () => ({
      bible: { name: 'Old', genSeed: 991, age: 30, gender: 'male',
               physical: { height: 'tall', build: 'lean', hair: { color: 'black' } } },
    });
    const m = MIGRATIONS.npcs.find(x => x.from === 6 && x.to === 7);
    const a = m.fn(mk()), b = m.fn(mk());
    if (!a.bible.physical.intimate) return false;
    if (a.bible.physical.intimate.genitals[0].type !== 'penis') return false;   // from stored gender
    if (a.bible.physical.height !== 'tall') return false;                        // nothing else touched
    return JSON.stringify(a.bible.physical.intimate) === JSON.stringify(b.bible.physical.intimate);
  })()
`));
check('re-running the NPC migration does not reroll an existing group', api(`
  (() => {
    const m = MIGRATIONS.npcs.find(x => x.from === 6 && x.to === 7);
    const once = m.fn({ bible: { genSeed: 5, gender: 'female', physical: { hair: {} } } });
    const twice = m.fn(JSON.parse(JSON.stringify(once)));
    return JSON.stringify(once.bible.physical.intimate) === JSON.stringify(twice.bible.physical.intimate);
  })()
`));
check('a pre-migration player gains name/surname/portrait/intimate', api(`
  (() => {
    const m = MIGRATIONS.player.find(x => x.from === 4 && x.to === 5);
    const out = m.fn({ money: 500, hunger: 80,
                       appearance: { age: 26, gender: 'female',
                                     physical: { height: 'short', build: 'slim', hair: { color: 'red' } } } });
    return out.name === '' && out.surname === ''
        && out.portrait && out.portrait.promptDirty === false
        && !!out.appearance.physical.intimate
        && out.appearance.physical.intimate.genitals[0].type === 'vagina'
        && out.money === 500 && out.appearance.physical.height === 'short';
  })()
`));
check('the player migration does NOT invent a name the player never chose', api(`
  (() => {
    const m = MIGRATIONS.player.find(x => x.from === 4 && x.to === 5);
    return m.fn({ appearance: null }).name === '';
  })()
`));
check('folder versions match the migration chains', api(`
  FOLDER_VERSIONS.npcs === Math.max(...MIGRATIONS.npcs.map(m => m.to))
  && FOLDER_VERSIONS.player === Math.max(...MIGRATIONS.player.map(m => m.to))
`));

// ---------------------------------------------------------------- 6
console.log('\n6. INTRO_BEATS is well formed');

const beats = api('INTRO_BEATS');
check('every beat has an id', beats.every(b => typeof b.id === 'string' && b.id));
check('beat ids are unique', new Set(beats.map(b => b.id)).size === beats.length);
check('every beat carries text or art (never an empty card)',
      beats.every(b => (b.lines && b.lines.length > 0) || (b.image && b.image.trim())));
check('every line has text', beats.every(b => (b.lines || []).every(l => typeof l.text === 'string' && l.text)));
const SPEAKERS = new Set(['lawyer', 'player', null, undefined]);
check('every speaker is one the stylesheet knows',
      beats.every(b => (b.lines || []).every(l => SPEAKERS.has(l.speaker))));
check('every `image` is a string (blank is the designed no-art case)',
      beats.every(b => typeof b.image === 'string'));
// The art has landed. Kept as an assertion rather than a comment because a
// beat silently losing its URL would degrade to a text card and play on —
// the degradation is deliberate, which is exactly why it would go unnoticed.
const artless = beats.filter(b => !b.image.trim());
check('every beat has art', artless.length === 0, artless.map(b => b.id).join(', '));
check('every image URL is absolute and well formed',
      beats.every(b => /^(https?:\/\/|data:image\/)/.test(b.image.trim())),
      beats.filter(b => !/^(https?:\/\/|data:image\/)/.test(b.image.trim())).map(b => b.id).join(', '));
check('no two beats share an image', new Set(beats.map(b => b.image)).size === beats.length);

// Interpolation: every token the script uses must be a key the draft actually
// carries, or a beat renders with a hole in it.
const DRAFT_KEYS = new Set(['name', 'surname']);
const usedTokens = new Set();
for (const b of beats) for (const l of b.lines || []) {
  for (const m of String(l.text).matchAll(/\{(\w+)\}/g)) usedTokens.add(m[1]);
}
const unknownTokens = [...usedTokens].filter(t => !DRAFT_KEYS.has(t));
check('every {token} used resolves against the draft shape', unknownTokens.length === 0, unknownTokens.join(', '));
check('the script actually USES the surname (the will names the grandfather)',
      usedTokens.has('surname') && beats.some(b => (b.lines || []).some(l => /Julius \{surname\}/.test(l.text))));
check('interpolation fills both tokens',
      api(`introInterpolate('I am {name} {surname}.', { name: 'Ada', surname: 'Vane' }) === 'I am Ada Vane.'`));
check('an unresolved token leaves no braces on screen',
      api(`!/[{}]/.test(introInterpolate('Hello {name} {nope}.', { name: 'Ada' }))`),
      api(`introInterpolate('Hello {name} {nope}.', { name: 'Ada' })`));
check('introBeatImage treats blank, whitespace and missing identically',
      api(`introBeatImage({ image: '' }) === '' && introBeatImage({ image: '   ' }) === '' && introBeatImage({}) === ''`));

// --- The art direction, as data ---
// These are the assertions that keep a REGENERATION honest: the reel gets
// rebuilt whenever the style tail changes (the global style picker is coming),
// and a beat that quietly lost its grade or its anonymity language would
// produce one image that does not match the other fifteen.
const GRADES = api('INTRO_ART.grades');
check('every beat has a shot, a grade and a prompt',
      beats.every(b => b.shot && b.grade && b.prompt),
      beats.filter(b => !(b.shot && b.grade && b.prompt)).map(b => b.id).join(', '));
check('every beat\'s grade names a real entry in INTRO_ART.grades',
      beats.every(b => b.grade in GRADES),
      beats.filter(b => !(b.grade in GRADES)).map(b => `${b.id}:${b.grade}`).join(', '));
check('every declared grade is actually used by a beat',
      Object.keys(GRADES).every(g => beats.some(b => b.grade === g)),
      Object.keys(GRADES).filter(g => !beats.some(b => b.grade === g)).join(', '));
const SHOTS = new Set(['SILHOUETTE', 'HANDS', 'POV', 'OBJECT', 'OTS', 'EXTERIOR']);
check('every shot tag is one of the six documented techniques',
      beats.every(b => SHOTS.has(b.shot)),
      beats.filter(b => !SHOTS.has(b.shot)).map(b => `${b.id}:${b.shot}`).join(', '));
// The colour progression IS the story, so a beat in the wrong act is a
// narrative bug rather than a nit. But the arc is not strictly monotonic by
// design: `promise` is documented as "the one place the arc warms early" —
// the tower glowing gold before the player steps inside, with the elevator
// dropping back to `passage` after it. So the assertion is what the design
// actually claims: the arc starts coldest, ends warmest, and any step
// BACKWARDS must be a return from a deliberate early-warm beat.
const ACT_ORDER = ['cramped', 'threshold', 'passage', 'promise', 'arrival'];
const EARLY_WARM = new Set(['promise']);
const actIdx = beats.map(b => ACT_ORDER.indexOf(b.grade));
check('every grade has a place in the arc', actIdx.every(v => v >= 0),
      beats.filter(b => ACT_ORDER.indexOf(b.grade) < 0).map(b => `${b.id}:${b.grade}`).join(', '));
check('the arc starts at the coldest act and ends at the warmest',
      actIdx[0] === 0 && actIdx[actIdx.length - 1] === ACT_ORDER.length - 1,
      `${beats[0].grade} → ${beats[beats.length - 1].grade}`);
const backsteps = [];
for (let i = 1; i < actIdx.length; i++) {
  if (actIdx[i] >= actIdx[i - 1]) continue;
  if (EARLY_WARM.has(beats[i - 1].grade)) continue;   // returning from a declared early-warm beat
  backsteps.push(`${beats[i - 1].id}(${beats[i - 1].grade}) → ${beats[i].id}(${beats[i].grade})`);
}
check('the arc never moves backwards except off a declared early-warm beat',
      backsteps.length === 0, backsteps.join(', '));

// The anonymity guarantee, asserted rather than trusted. Every beat that could
// contain a person must SAY so in its own prompt — the shared negative prompt
// is a backstop, not the mechanism, and a prompt that merely omits a face
// leaves the model free to add one.
const PEOPLE_SHOTS = ['SILHOUETTE', 'HANDS', 'POV', 'OTS'];
// The mechanisms a prompt may use to be anonymous. `gloved` and `backlit`
// joined this list when the keys shot was regenerated: a black glove reading
// as a dark shape is a complete answer to "whose hand is this", and demanding
// the literal phrase "no face" of a shot with no face in it was the check
// being pedantic rather than protective.
const ANON = /no (face|facial|head|body|torso|people|hair|skin|profile)|featureless|silhouette|cropped away|point-of-view|gloved|backlit|unreadable/i;
const missingAnon = beats.filter(b => PEOPLE_SHOTS.includes(b.shot) && !ANON.test(b.prompt));
check('every people-bearing shot states its own anonymity in the prompt',
      missingAnon.length === 0, missingAnon.map(b => b.id).join(', '));
// The one promise this reel makes: it is true for every body the studio can
// build. Asserted as a CLASS of vocabulary rather than by matching pool words,
// because pool entries are multi-word and their parts are innocent on their
// own — "pale glow", "slim briefcase" and "deep cornices" are not a skin tone,
// a build and a hair colour. What actually breaks the promise is naming a
// body part the player authors, or gendering the protagonist at all.
const BODY_WORDS = /\b(hair|skin|complexion|freckle\w*|eyes?|eyebrows?|beard|stubble|lips|cheekbones?|jawline|tattoo\w*|piercing\w*)\b/i;
const GENDERED = /\b(man|woman|men|women|male|female|boy|girl|guy|lady|his|her|hers|he|she)\b/i;
// DENIED mentions are the opposite of a violation. "no hair, no face, no
// skin" and "its skin tone unreadable" are the strongest anonymity language
// in the reel, and the first version of this check flagged them as failures —
// it would have pushed the prompts toward saying LESS about what must not be
// drawn, which is exactly backwards. Strip negated mentions before testing.
const stripDenials = (s) => String(s)
  .replace(/\bno\s+(?:[a-z-]+[, ]+)*?(hair|skin|face|facial|profile|body|head|hands?|eyes?|features?)\b/gi, ' ')
  .replace(/\b(skin tone|skin)\s+unreadable\b/gi, ' ')
  .replace(/\bso no skin shows\b/gi, ' ');
const bodyHits = beats.filter(b => BODY_WORDS.test(stripDenials(b.prompt)));
const genderHits = beats.filter(b => GENDERED.test(b.prompt));
check('no beat prompt names a body part the player authors (denials excepted)',
      bodyHits.length === 0,
      bodyHits.map(b => `${b.id}: ${(stripDenials(b.prompt).match(BODY_WORDS) || [])[0]}`).join(', '));
// ...and prove the stripper is not just deleting everything it sees.
check('the denial-stripper still catches a real trait mention',
      BODY_WORDS.test(stripDenials('a person with long blonde hair and pale skin')),
      'a positive trait description must still fail');
check('no beat prompt genders anyone',
      genderHits.length === 0,
      genderHits.map(b => `${b.id}: ${(b.prompt.match(GENDERED) || [])[0]}`).join(', '));

// The split that makes a restyle cheap: style words belong in the ONE tail,
// never on a beat. If they leak into beats, a restyle means 16 edits.
const STYLE_WORDS = /\b(cel-shaded|anime|illustration|watercolou?r|photoreal(istic)?|oil painting|pixel art|3d render|masterpiece|best quality|linework)\b/i;
const styled = beats.filter(b => STYLE_WORDS.test(b.prompt));
check('no beat prompt hard-codes a visual style (they must stay swappable)',
      styled.length === 0, styled.map(b => b.id).join(', '));
check('buildIntroPrompt assembles subject + grade + style for every beat',
      beats.every(b => {
        const p = api(`buildIntroPrompt(INTRO_BEATS.find(x => x.id === '${b.id}'))`);
        return p.includes(b.prompt) && p.includes(GRADES[b.grade]) && p.includes(api('INTRO_ART.styleTail'));
      }));
check('the negative prompt carries both the anonymity and the hand terms',
      /face/.test(api('INTRO_ART.negativePrompt')) && /fused fingers/.test(api('INTRO_ART.negativePrompt'))
      && /child/.test(api('INTRO_ART.negativePrompt')));

// The studio's row groups must all be reachable from the tab table, or a
// group is defined and never rendered.
check('every STUDIO_ROW_GROUPS key is used by a `rows` field', api(`
  (() => {
    const used = new Set();
    for (const tab of PLAYER_STUDIO_TABS)
      for (const sec of tab.sections)
        for (const f of sec.fields) if (f.kind === 'rows') used.add(f.path);
    return Object.keys(STUDIO_ROW_GROUPS).every(k => used.has(k))
        && [...used].every(k => k in STUDIO_ROW_GROUPS);
  })()
`));
check('a fresh genital row is complete for its type, not a row of blanks', api(`
  (() => Object.keys(GENITAL_TYPE_FIELDS).every(t => {
    const row = rollStudioGenitalBlank(t);
    return Object.entries(GENITAL_TYPE_FIELDS[t])
      .every(([k, spec]) => spec.pool ? !!row[k] : row[k] === '');
  }))()
`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
