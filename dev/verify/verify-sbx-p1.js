// Seasonal Calendar & Sandbox Plan — Phase B1: the authored-field lock.
//
// A bible may carry `authoredFields: string[]` — dotted paths the player
// wrote by hand. mergeProseIntoBible (llm.js) is the ONE merge point for
// prose expansion and skips any path the list covers; the field must be
// declared in CHARACTER_SCHEMA (config.js) or validateCharacter strips it on
// the way in and the lock is a no-op that looks like it works (the castWeb
// scar — design invariant 3).
//
// With an EMPTY authoredFields the merge must be byte-identical to the old
// inline object literal approveCastAndStartGame used to build — that is the
// no-regression guarantee, pinned against an inline copy of the old code.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!(k in b) || !deepEqual(a[k], b[k])) return false;
  return true;
}

const merge = api('mergeProseIntoBible');
const validateCharacter = api('validateCharacter');

// A bible with every prose-overwritable field already populated, so a
// sentinel overwrite is distinguishable from a keep.
const AUTH_BIBLE = {
  name: 'Alice',
  surname: 'Ashworth',
  visual: 'Authored visual paragraph',
  age: 26,
  gender: 'female',
  genSeed: 123,
  physical: {
    hair: { color: 'red', length: 'long', style: 'wavy' },
    eyes: { color: 'green' },
    build: 'lean',
    heightBuild: 'tall and lean',
  },
  history: 'Authored history',
  sketch: 'Authored sketch',
  sampleLines: ['authored line'],
};

// A stub prose object that sets EVERY field expandCharacterProse can produce
// to a sentinel, so a kept field is a keep and a merged field is a sentinel.
const SENTINEL_PROSE = {
  name: 'PROSE_NAME',
  surname: 'PROSE_SURNAME',
  visual: 'PROSE_VISUAL',
  age: 99,
  gender: 'PROSE_GENDER',
  physical: {
    hair: { color: 'PROSE_HAIR_COLOR', length: 'PROSE_HAIR_LENGTH', style: 'PROSE_HAIR_STYLE' },
    eyes: { color: 'PROSE_EYES_COLOR' },
    build: 'PROSE_BUILD',
  },
  history: 'PROSE_HISTORY',
  sketch: 'PROSE_SKETCH',
  sampleLines: ['PROSE_LINE'],
};

// ---------------------------------------------------------------- 1
console.log('\n1. The lock: authored name/physical/visual survive a sentinel prose pass');

{
  const out = merge(AUTH_BIBLE, SENTINEL_PROSE, ['name', 'physical', 'visual']);
  check('authored name kept', out.name === 'Alice', `got "${out.name}"`);
  check('surname (Discord feedback, 2026-08-24) wins even unlocked, same rule as name', out.surname === 'Ashworth', `got "${out.surname}"`);
  check('authored visual kept', out.visual === 'Authored visual paragraph', `got "${out.visual}"`);
  check('authored physical kept whole (hair.color is the bible\'s, not PROSE_HAIR_COLOR)',
        out.physical.hair.color === 'red' && out.physical.eyes.color === 'green' && out.physical.build === 'lean');
  check('authored physical kept, values equal to the bible\'s',
        deepEqual(out.physical, AUTH_BIBLE.physical));
  check('history took the sentinel', out.history === 'PROSE_HISTORY', `got "${out.history}"`);
  check('sketch took the sentinel', out.sketch === 'PROSE_SKETCH', `got "${out.sketch}"`);
  check('sampleLines took the sentinel', deepEqual(out.sampleLines, ['PROSE_LINE']));
  check('unclaimed first-class fields (age/gender) carry through untouched',
        out.age === 26 && out.gender === 'female');
  check('genSeed carried through', out.genSeed === 123);
}

// ---------------------------------------------------------------- 2
console.log('\n2. Prefix matching');

{
  // 'physical' protects everything under physical.
  const whole = merge(AUTH_BIBLE, SENTINEL_PROSE, ['physical']);
  check("'physical' protects physical.hair.color", whole.physical.hair.color === 'red', `got ${whole.physical.hair.color}`);
  check("'physical' protects physical.eyes.color", whole.physical.eyes.color === 'green');
  check("'physical' protects physical.build", whole.physical.build === 'lean');
  check("'physical' does NOT leak protection to name — the default guarded rule still applies (existing bible name wins)",
        whole.name === 'Alice', `got ${whole.name}`);
  check("'physical' in the list does not stop name falling through to prose when the bible name is blank",
        merge({ ...AUTH_BIBLE, name: '' }, SENTINEL_PROSE, ['physical']).name === 'PROSE_NAME');

  // 'physical.hair' protects the hair subtree but nothing else under physical.
  const hair = merge(AUTH_BIBLE, SENTINEL_PROSE, ['physical.hair']);
  check("'physical.hair' protects physical.hair.color", hair.physical.hair.color === 'red');
  check("'physical.hair' protects physical.hair.length", hair.physical.hair.length === 'long');
  check("'physical.hair' does NOT protect physical.eyes.color", hair.physical.eyes.color === 'PROSE_EYES_COLOR', `got ${hair.physical.eyes.color}`);
  check("'physical.hair' does NOT protect physical.build", hair.physical.build === 'PROSE_BUILD');

  // 'physical.hair.color' protects only the leaf — siblings still merge.
  const leaf = merge(AUTH_BIBLE, SENTINEL_PROSE, ['physical.hair.color']);
  check("'physical.hair.color' protects physical.hair.color", leaf.physical.hair.color === 'red');
  check("'physical.hair.color' does NOT protect physical.hair.length", leaf.physical.hair.length === 'PROSE_HAIR_LENGTH', `got ${leaf.physical.hair.length}`);
  check("'physical.hair.color' does NOT protect physical.eyes.color", leaf.physical.eyes.color === 'PROSE_EYES_COLOR');
}

// ---------------------------------------------------------------- 3
console.log('\n3. No-regression: empty authoredFields is byte-identical to the old inline merge');

{
  // The exact object literal approveCastAndStartGame used to build, inlined.
  const old = {
    ...AUTH_BIBLE,
    name: AUTH_BIBLE.name || SENTINEL_PROSE.name,
    // surname (Discord feedback, 2026-08-24): the ONE intentional shape
    // change since this pin was written — a bible never carried one before.
    // Same guarded rule as name, so it belongs in the "old" comparison
    // object exactly like name does, not as a regression.
    surname: AUTH_BIBLE.surname || SENTINEL_PROSE.surname,
    visual: SENTINEL_PROSE.visual,
    physical: { ...AUTH_BIBLE.physical, ...SENTINEL_PROSE.physical },
    history: SENTINEL_PROSE.history,
    sketch: SENTINEL_PROSE.sketch,
    sampleLines: SENTINEL_PROSE.sampleLines,
  };
  const out = merge(AUTH_BIBLE, SENTINEL_PROSE, []);
  check('empty authoredFields matches the old merge deepEqual', deepEqual(out, old),
        `expected ${JSON.stringify(old)}\n        got      ${JSON.stringify(out)}`);
  check('JSON-identical too (key order preserved)', JSON.stringify(out) === JSON.stringify(old));

  // The old guarded-name rule is unchanged without the lock: bible.name wins.
  const out2 = merge({ ...AUTH_BIBLE, name: '' }, SENTINEL_PROSE, []);
  check('empty bible name falls through to prose.name without the lock', out2.name === 'PROSE_NAME', `got "${out2.name}"`);
  const out2b = merge({ ...AUTH_BIBLE, surname: '' }, SENTINEL_PROSE, []);
  check('empty bible surname falls through to prose.surname without the lock', out2b.surname === 'PROSE_SURNAME', `got "${out2b.surname}"`);

  // The old unconditional-visual rule is unchanged without the lock: a
  // present bible.visual is still clobbered (that was the pre-lock bug D12
  // fixes only for authored bibles).
  const out3 = merge({ ...AUTH_BIBLE }, SENTINEL_PROSE, []);
  check('present bible.visual is clobbered without the lock (old behaviour pinned)', out3.visual === 'PROSE_VISUAL');
}

// A bible carrying every field validateCharacter requires, so a validation
// failure means the authoredFields handling — not a missing required field.
const COMPLETE_BIBLE = {
  ...AUTH_BIBLE,
  temperament: { warmth: 0.2, volatility: -0.1, openness: 0.5, conscientiousness: 0.8, assertiveness: 0.1, selfAwareness: 0.4 },
  occupation: { category: 'service', title: 'Barista', scheduleTemplate: 'standard', incomeBand: 'low', hours: 'flexible' },
  interests: [{ name: 'photography', tags: ['creative'], skill: 40 }],
  values: [{ name: 'honesty', opposition: 'deception' }],
  baggage: 'Carries her family\'s debts',
  wound: 'A broken engagement',
  want: 'To pay off the debts and start fresh',
  blindSpot: 'She takes blame too easily',
  boundary: 'Never talks about the engagement',
  speech: { verbosity: 0.5, formality: 0.3, humorStyle: 'dry', profanityLevel: 0.2, verbalTics: [], textingStyle: 'casual' },
  scheduleTemplate: 'standard',
};

// ---------------------------------------------------------------- 4
console.log('\n4. The lock is not a no-op: auth claims survive the single construction gate');

{
  const schemaEntry = api('CHARACTER_SCHEMA.bible.authoredFields');
  check('authoredFields is declared in CHARACTER_SCHEMA.bible (design invariant 3)',
        !!schemaEntry && schemaEntry.type === 'array');

  const r = validateCharacter({
    bible: { ...COMPLETE_BIBLE, authoredFields: ['name', 'physical', 'visual'] },
    bibleRevision: 0,
    bibleChanges: [],
  });
  check('a bible carrying authoredFields validates', r.valid === true, (r.errors || []).join(', '));
  check('authoredFields survives validation normalization', deepEqual(r.normalized.bible.authoredFields, ['name', 'physical', 'visual']),
        `got ${JSON.stringify(r.normalized.bible.authoredFields)}`);
  check('rest of the bible survived too (name/visual)', r.normalized.bible.name === 'Alice' && r.normalized.bible.visual === 'Authored visual paragraph');

  // A bible with NO authoredFields normalises to [] (schema default) — old
  // bibles load harmlessly.
  const r2 = validateCharacter({ bible: COMPLETE_BIBLE, bibleRevision: 0, bibleChanges: [] });
  check('a bible without authoredFields validates and normalises to []', r2.valid === true && deepEqual(r2.normalized.bible.authoredFields, []),
        `got ${JSON.stringify(r2.normalized.bible.authoredFields)}`);

  // The name lock still holds through the merge even when the authored name
  // is empty — an authored-but-blank name is not overwritten.
  const blankName = merge({ ...AUTH_BIBLE, name: '' }, SENTINEL_PROSE, ['name']);
  check('authored blank name stays blank (not replaced by prose)', blankName.name === '', `got "${blankName.name}"`);
  const blankSurname = merge({ ...AUTH_BIBLE, surname: '' }, SENTINEL_PROSE, ['surname']);
  check('authored blank surname stays blank (not replaced by prose)', blankSurname.surname === '', `got "${blankSurname.surname}"`);
}

// ---------------------------------------------------------------- 5
console.log('\n5. Source shape: the old merge literal is gone, the lock is wired');

const SRCFILES = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const srcOf = (f) => fs.readFileSync(path.join(SRCFILES, f), 'utf8');

const uiSrc = srcOf('ui.js');
check('ui.js calls mergeProseIntoBible from approveCastAndStartGame', /const candidateBible = mergeProseIntoBible\(npc\.bible, prose, npc\.bible\.authoredFields\)/.test(uiSrc),
      'the call must pass npc.bible.authoredFields through');
check('the old inline merge literal is gone from ui.js', !/physical: \{\s*\.\.\.npc\.bible\.physical, \.\.\.prose\.physical/.test(uiSrc),
      'search for `physical: { ...npc.bible.physical, ...prose.physical }`');
check('ui.js\'s prose-expansion comment names the B1/D12 lock', /B1\/D12 authored-field lock/.test(uiSrc));

const llmSrc = srcOf('llm.js');
check('mergeProseIntoBible is defined beside expandCharacterProse in llm.js',
      /function mergeProseIntoBible\(bible, prose, authoredFields = \[\]\)/.test(llmSrc));
check('the D12 why-physical-survived comment is present in llm.js', /accidental and undocumented/.test(llmSrc));
check('mergeProseIntoBible has exactly one call site across src/srcfiles (approveCastAndStartGame)',
      (() => {
        const files = fs.readdirSync(SRCFILES).filter(f => f.endsWith('.js'));
        const sites = [];
        for (const f of files) {
          if (f === 'llm.js') continue;
          const src = srcOf(f);
          for (const [i, line] of src.split('\n').entries()) {
            if (line.includes('mergeProseIntoBible(')) sites.push(`${f}:${i + 1}`);
          }
        }
        return sites;
      })().length === 1);

const cfgSrc = srcOf('config.js');
check('config.js schema entry carries the D12 comment', /authoredFields: \{ type: 'array', required: false, default: \[\], maxItems: 20 \}/.test(cfgSrc));

// ---------------------------------------------------------------- 6
console.log('\n6. Save/load round-trip through the REAL writeGeneratedGameState/loadGameState (in-memory kv)');

// In-memory kv adapter (mirrors kv-plugin's folder surface — same as the
// intimacy-voyeurism phase harnesses use) plus a house helper, injected into
// the vm context.
api(`
  function makeMemKv() {
    const stores = {};
    const wrap = (name) => {
      const m = {};
      m.get = async (k) => { const s = stores[name] || (stores[name] = {}); const v = s[k]; return v === undefined ? undefined : structuredClone(v); };
      m.set = async (k, v) => { const s = stores[name] || (stores[name] = {}); s[k] = structuredClone(v); };
      m.update = async (k, fn) => { const cur = await m.get(k); const nv = fn(cur); await m.set(k, nv); return nv; };
      m.keys = async () => Object.keys(stores[name] || {});
      m.delete = async (k) => { if (stores[name]) delete stores[name][k]; };
      return m;
    };
    const kv = {};
    for (const f of ['meta', 'player', 'world', 'npcs', 'objects', 'images', 'snapshots', 'saves', 'saveIndex']) kv[f] = wrap(f);
    return kv;
  }
`);
api(`
  function house(seed, n) {
    const partials = [];
    for (let i = 0; i < n; i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      h.npcs[id].flags = {};
      h.npcs[id].location = h.npcs[id].residency.room;
    }
    return h;
  }
`);

(async () => {
  const trip = api(`(async () => {
    root.kv = makeMemKv();
    // Pre-seed meta so initStorage's check-and-migrate path is a no-op
    // (the exact live-page swap trick — an empty kv fails the migration
    // assert because meta is missing).
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'sbxp1', clock: { day: 1, minutes: 0 } });
    const h = house(20260822, 3);
    const r1 = Object.keys(h.npcs).find(id => h.npcs[id].residency.status === 'resident');
    const authored = ['name', 'physical', 'visual'];
    h.npcs[r1].bible.authoredFields = authored;
    const nameBefore = h.npcs[r1].bible.name;
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const rt = loaded.npcs[r1].bible.authoredFields;
    return {
      ok: JSON.stringify(rt) === JSON.stringify(authored),
      rt,
      nameKept: loaded.npcs[r1].bible.name === nameBefore,
      hasAuthoredKey: Object.prototype.hasOwnProperty.call(loaded.npcs[r1].bible, 'authoredFields'),
    };
  })()`);
  const result = await trip;
  check('authoredFields survives writeGeneratedGameState → loadGameState', result.ok === true, JSON.stringify(result));
  check('the authoredFields key is present on the loaded bible, and the rest of it survived', result.hasAuthoredKey === true && result.nameKept === true, JSON.stringify(result));

  console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
})();
