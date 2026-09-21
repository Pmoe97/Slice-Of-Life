// Phase 5 verification — dead-field triage (D16).
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');

const SRC = path.join(__dirname, '..', '..', 'srcfiles');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// Non-comment references to an identifier across the source tree.
function liveRefs(ident) {
  const out = [];
  for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.js'))) {
    fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      if (new RegExp(`\\b${ident}\\b`).test(line)) out.push(`${f}:${i + 1}  ${t.slice(0, 70)}`);
    });
  }
  return out;
}

console.log('\nPRUNED — no non-comment reference anywhere');
// `genitals` was on this list and has deliberately LEFT it: the player
// creation + intro plan (Phase 1) reintroduced it under `physical.intimate`
// WITH the producer and consumer whose absence got it pruned in the first
// place. It is now asserted the other way up, below — the rule was never
// "this field is banned", it was RI6, "a field needs both halves".
for (const ident of ['stressProfile', 'lastJobMention', 'lastHobbyMention']) {
  const refs = liveRefs(ident);
  check(`${ident.padEnd(18)} fully removed`, refs.length === 0, refs.slice(0, 3).join('\n        '));
}
// `arcs` needs a tighter pattern — the word appears inside other identifiers.
const arcRefs = liveRefs('arcs').filter(r => /\barcs\s*[:.]|\.arcs\b/.test(r));
check('arcs               fully removed', arcRefs.length === 0, arcRefs.join('\n        '));

console.log('\nPRUNED — and the schema no longer declares them');
const S = api('CHARACTER_SCHEMA');
check('bible.occupation has no stressProfile', !('stressProfile' in S.bible.occupation.fields));
// NOT a prune check any more. `genitals` is back, one level down, and the
// thing worth asserting is that it did not sneak back to the TOP level (where
// it would be outside the single gate `intimate` exists to provide) — a check
// that would otherwise pass silently for the wrong reason.
check('bible.physical has no top-level genitals', !('genitals' in S.bible.physical.fields));
check('genitals lives under physical.intimate instead',
      !!S.bible.physical.fields.intimate?.fields?.genitals);
check('memory.styleCounters has no lastJobMention/lastHobbyMention',
      !('lastJobMention' in S.mutable.memory.fields.styleCounters.fields) &&
      !('lastHobbyMention' in S.mutable.memory.fields.styleCounters.fields));
check('mutable has no arcs', !('arcs' in S.mutable));

console.log('\nWIRED — fields that were dead now reach a prompt');
// Build a real NPC and read the actual prompt block.
api(`
  __h = SIM_generateHouse(4242, 2);
  __ids = Object.keys(__h.npcs);
  __npc = { ...__h.npcs[__ids[0]], id: __ids[0], name: __h.npcs[__ids[0]].bible.name,
            castWebSlice: [], memory: __h.npcs[__ids[0]].memory };
  __block = buildNpcBlockV2(__npc, 'hello', 'scene');
  __phys = getPhysicalDescriptionForPrompt(__npc);
`);
const block = api('__block');
const phys = api('__phys');
const p = api('__npc.bible.physical');

check('vocabularyLevel now appears in [Speech]', /vocabulary \d/.test(block),
      block.split('\n').find(l => l.startsWith('[Speech]')) || 'no [Speech] line');
for (const [label, val] of [
  ['skin.ethnicity', p.skin.ethnicity], ['face.cheekbones', p.face.cheekbones],
  ['face.jawline', p.face.jawline], ['face.ears', p.face.ears],
  ['body.buttSize', p.body.buttSize], ['body.posture', p.body.posture],
]) {
  check(`${label.padEnd(16)} reaches the physical description`,
        !!val && phys.includes(val), `value "${val}" not in: ${phys.slice(0, 120)}…`);
}
// accessories is filled by the prose expansion, not the roller — inject and re-read.
api(`
  __npc2 = JSON.parse(JSON.stringify(__npc));
  __npc2.bible.physical.accessories = 'a scratched steel watch';
  __phys2 = getPhysicalDescriptionForPrompt(__npc2);
`);
check('accessories      reaches the physical description',
      api('__phys2').includes('a scratched steel watch'));

console.log('\nWIRED — authored content is no longer thrown away');
// Del Connors is hand-authored in config.js and was the reason three fields
// were wired instead of pruned.
api(`
  __del = JSON.parse(JSON.stringify(__npc));
  __del.bible.speech = { ...CONTRACTOR_BIBLE.speech };
  __delBlock = buildNpcBlockV2(__del, 'hello', 'scene');
`);
const delBlock = api('__delBlock');
check("Del's catchphrases reach the prompt", delBlock.includes("We'll get it sorted."),
      delBlock.split('\n').filter(l => /Speech|say/.test(l)).join(' | ') || 'not found');
check("Del's vocabularyLevel reaches the prompt", /vocabulary 0\.6/.test(delBlock));
check('a generated NPC with no catchphrases emits no empty line',
      !block.includes('Things they say:'));

console.log('\nWIRED — 2026-09-21 re-audit: two Reserved claims were stale');
// sampleLines/history were credited to Plan 4 ("few-shot voice examples" /
// "compressed into the prompt"); Plan 4 shipped without ever touching either.
// firstMetDay was credited to Plan 4's "daysKnown in the player model", which
// never got built either. All three are now wired directly, not by the plans
// that were supposed to deliver them — see npc-correctness-fixes-plan.md's
// Phase 5 correction.
api(`
  __npc3 = JSON.parse(JSON.stringify(__npc));
  __npc3.bible.history = 'Grew up three towns over and came here for the job.';
  __npc3.bible.sampleLines = ["Honestly? I'd rather just deal with it now."];
  __npc3.relPlayer.firstMetDay = 1;
  __histBlock = buildNpcBlockV2(__npc3, 'hello', 'scene');
  __daysBlock = buildNpcBlockV2(__npc3, 'hello', 'scene', 10);
  __day1Block = buildNpcBlockV2(__npc3, 'hello', 'scene', 1);
`);
check("bible.history reaches the prompt as [History]",
      api('__histBlock').includes('[History]: Grew up three towns over'));
check("bible.sampleLines reaches the prompt as voice examples",
      api('__histBlock').includes("Honestly? I'd rather just deal with it now."));
check("firstMetDay-derived daysKnown appears once real time has passed",
      /known them for 9 days/.test(api('__daysBlock')));
check("daysKnown line is omitted on the day they met (no false 'known for 0 days')",
      !api('__day1Block').includes('known them for'));

// typicalAttire was credited to Plan 2 ("what are they wearing right now");
// that plan shipped without ever consulting it either. Proves the wiring
// actually MOVES a real outfit pick, not just adds an inert bias term: blouse
// beats dress_shirt on raw trait+stat score alone (6.6 vs 6.55), so the flip
// below only happens if the extracted style words genuinely reach
// composeOutfit's scorer.
api(`
  __attireNpc = { bible: { occupation: {}, physical: { typicalAttire: {} } }, residency: {}, inventory: [] };
  __attireIds = ['blouse', 'dress_shirt'];
  __noAttireLean = composeOutfit('work', __attireIds, {});
  __attireNpc.bible.physical.typicalAttire.work = 'always sharp and crisp';
  __attireLean = typicalAttireStyleLean(__attireNpc, 'work');
  __withAttireLean = composeOutfit('work', __attireIds, { styleLean: __attireLean });
  __delAttireLean = typicalAttireStyleLean({ bible: CONTRACTOR_BIBLE }, 'work');
`);
check('typicalAttire text extracts its known style words',
      JSON.stringify(api('__attireLean')) === JSON.stringify(['sharp', 'crisp']));
check('without the lean, raw trait+stat score picks blouse',
      api('__noAttireLean.top') === 'blouse');
check('with typicalAttire.work "sharp and crisp", the pick flips to dress_shirt',
      api('__withAttireLean.top') === 'dress_shirt');
check("Del's typicalAttire ('coveralls') legitimately extracts nothing — an honest no-op, not a bug",
      Array.isArray(api('__delAttireLean')) && api('__delAttireLean').length === 0);

console.log('\nRESERVED — kept deliberately, with the plan that claims them');
const RESERVED = {
  'emotionalTag':   S.mutable.memory.fields.episodes.itemFields.emotionalTag,
  'participants':   S.mutable.memory.fields.episodes.itemFields.participants,
  'lastInteractionDay': S.mutable.relPlayer.fields.lastInteractionDay,
  'bibleRevision':  S.mutable.bibleRevision,
  'bibleChanges':   S.mutable.bibleChanges,
};
for (const [name, spec] of Object.entries(RESERVED)) {
  check(`${name.padEnd(20)} still declared`, spec !== undefined);
}
check('interests[].skill still generated', typeof api('__npc.bible.interests[0].skill') === 'number');
check("Del's typicalAttire content preserved",
      api(`CONTRACTOR_BIBLE.physical.typicalAttire.work`) === 'coveralls');

console.log('\nKEEP — audit called these dead; they have real readers');
check('facts[].category drives renovation-fact invalidation',
      liveRefs('category').some(r => r.includes("f.category === 'renovation")),
      'expected computer.js to read f.category');
check('values[].opposition feeds computeFriction',
      liveRefs('opposition').some(r => r.includes('valFriction') || r.includes('va.opposition')));
check('selfAwareness renders in the character studio',
      liveRefs('selfAwareness').some(r => r.startsWith('render.computer.js')));
check('facts[].importance is read by Phase 3 eviction',
      api(`(() => {
        let n = { memory: { facts: [], episodes: [], recent: [], styleCounters: {} } };
        for (let i = 0; i < 40; i++) n = addMemoryFact(n, { text: 'x' + i, importance: 0.1 });
        n = addMemoryFact(n, { text: 'KEEPER', importance: 1 });
        return n.memory.facts.some(f => f.text === 'KEEPER');
      })()`));

console.log('\nGeneration still round-trips cleanly');
check('a fresh cast validates with no errors', api(`
  (() => {
    const h = SIM_generateHouse(777, 3);
    for (const npc of Object.values(h.npcs)) {
      const r = validateCharacter({ bible: npc.bible });
      if (!r.valid) { console.log('        ' + r.errors.join('; ')); return false; }
    }
    return true;
  })()
`));
check('no generated NPC carries a pruned field', api(`
  (() => {
    const h = SIM_generateHouse(888, 3);
    for (const npc of Object.values(h.npcs)) {
      if ('arcs' in npc) return false;
      if ('stressProfile' in (npc.bible.occupation || {})) return false;
      if ('genitals' in (npc.bible.physical || {})) return false;   // top level only — see above

      const sc = npc.memory.styleCounters || {};
      if ('lastJobMention' in sc || 'lastHobbyMention' in sc) return false;
    }
    return true;
  })()
`));
check('an external NPC (createExternalNpc path) is clean too', api(`
  (() => {
    const h = SIM_generateHouse(999, 1);
    const gs = { meta: { seed: h.seed, clock: h.clock }, npcs: h.npcs, world: h.world, objects: h.objects, player: h.player };
    const ext = createExternalNpc(gs, 'test_ext', 'test_ext', 'Delivery Driver');
    return !('arcs' in ext)
        && !('stressProfile' in ext.bible.occupation)
        && typeof ext.bible.speech.vocabularyLevel === 'number';
  })()
`));
check('a pre-prune save survives the npcs migration chain', api(`
  (() => {
    const stale = {
      bible: { name: 'Old', genSeed: 5, age: 30, gender: 'female',
               speech: { verbosity: 0.5, formality: 0.5, humorStyle: 'dry', profanityLevel: 0.2 },
               occupation: { category: 'tech', title: 'Dev', scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: '9-17', stressProfile: 0.4 },
               interests: [], temperament: {}, physical: { genitals: '' } },
      relPlayer: { trust: 0.2, affection: 0.2, tension: 0, respect: 0, comfort: 0, desire: 0 },
      memory: { facts: [], episodes: [], recent: [], styleCounters: { lastJobMention: -1 } },
      needs: {}, residency: { status: 'resident', since: 1 }, arcs: [],
    };
    let out = stale;
    for (const m of MIGRATIONS.npcs) out = m.fn(out);
    // Stale extras are inert, not fatal — what matters is nothing throws and
    // the live fields are correct.
    return out.bible.speech.vocabularyLevel === 0.5
        && Array.isArray(out.bible.speech.catchphrases)
        && out.relPlayer.conversationPhase === 'early';
  })()
`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
