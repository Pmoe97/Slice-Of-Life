// Sandbox prior-relationship & family feature (2026-09-21, character-creation
// field-impact session, locked design decisions).
//
//   node src/src/dev/verify/verify-prior-relationship.js
//
// Every roommate today starts relPlayer flat at 0 and firstMetDay at day 1 —
// the mechanical cause of a deliberately-authored old friend or sibling
// reading, to npcIsStrangerTo (willingness.js), as a total stranger. This
// feature lets a Sandbox roommate carry a real PRIOR_RELATIONSHIP_KINDS pick
// (config.js), applied at generation by SIM's applyPriorRelationship, and
// told to the model plainly through buildNpcBlockV2 (llm.js).
//
// The invariant this suite cares about most: family is "fully emergent, no
// special rule" (the locked decision on the sensitive question) — nothing
// here may make a family pick read as more or less available for intimacy
// than a same-warmth non-family friend pick would. That means: no entry may
// ever set `desire`, and no code anywhere branches on `category` or `id`.
const path = require('path');
const fs = require('fs');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

console.log('\n=== Sandbox prior-relationship & family feature ===');

// ---------------------------------------------------------------------------
console.log('\nData — PRIOR_RELATIONSHIP_KINDS and the schema enum stay in sync');

const kinds = api('PRIOR_RELATIONSHIP_KINDS');
const schemaEnum = api('CHARACTER_SCHEMA.mutable.relPlayer.fields.priorRelationshipKind.enum');
check('every PRIOR_RELATIONSHIP_KINDS id is in the schema enum, and vice versa',
      JSON.stringify([...kinds.map(k => k.id)].sort()) === JSON.stringify([...schemaEnum].sort()),
      JSON.stringify({ kinds: kinds.map(k => k.id), schemaEnum }));
check("'stranger' is not a stored value — it is the absence of a pick",
      !kinds.some(k => k.id === 'stranger') && !schemaEnum.includes('stranger'));
check('both family categories the user asked for, and both are present: sibling + at least one other relative kind',
      kinds.some(k => k.id === 'sibling' && k.category === 'family')
      && kinds.filter(k => k.category === 'family').length >= 4,
      JSON.stringify(kinds.filter(k => k.category === 'family').map(k => k.id)));
check('no entry of ANY category ever sets desire — the locked "fully emergent" decision on family',
      kinds.every(k => !('desire' in (k.axes || {}))),
      JSON.stringify(kinds.filter(k => 'desire' in (k.axes || {})).map(k => k.id)));
check('every entry declares the five non-desire relPlayer axes', kinds.every(k => {
  const a = k.axes || {};
  return ['trust', 'affection', 'tension', 'respect', 'comfort'].every(ax => typeof a[ax] === 'number');
}));

// ---------------------------------------------------------------------------
console.log('\napplyPriorRelationship (sim.js) — pure, backdates, re-derives phase');

api(`
  __h = SIM_generateHouse(4242, 2);
  __ids = Object.keys(__h.npcs);
  __base = __h.npcs[__ids[0]];
`);
check('an unknown kindId is a no-op — same object back, untouched', api(`
  applyPriorRelationship(__base, 'not_a_real_kind', 1) === __base
`));
check('a null npc is a no-op rather than throwing', api(`
  applyPriorRelationship(null, 'sibling', 1) === null
`));

api(`
  __sib = applyPriorRelationship(__base, 'sibling', 1);
  __sibKind = PRIOR_RELATIONSHIP_KINDS.find(k => k.id === 'sibling');
`);
check('the original npc is untouched (pure, not mutated in place)', api(`
  __base.relPlayer.trust === 0 && __base.relPlayer.priorRelationshipKind === undefined
`));
check('every declared axis lands exactly as the table says', api(`
  ['trust', 'affection', 'tension', 'respect', 'comfort'].every(ax => __sib.relPlayer[ax] === __sibKind.axes[ax])
`));
check('desire is left at its prior value, not set by the kind', api(`
  __sib.relPlayer.desire === __base.relPlayer.desire
`));
check('priorRelationshipKind is stamped', api(`__sib.relPlayer.priorRelationshipKind === 'sibling'`));
check('firstMetDay is backdated by exactly monthsKnown * 30 days from the day passed in', api(`
  __sib.relPlayer.firstMetDay === 1 - Math.round(__sibKind.monthsKnown * 30)
`));
check('conversationPhase/intimacyLevel are RE-DERIVED from the new axes, not left stale at early/0', api(`
  (() => {
    const expected = deriveConversationPhase(__sib.relPlayer);
    return __sib.relPlayer.conversationPhase === expected.conversationPhase
        && __sib.relPlayer.intimacyLevel === expected.intimacyLevel
        && expected.conversationPhase !== 'early';
  })()
`), 'a warmed-up sibling must not still read as "you barely know them"');

// ---------------------------------------------------------------------------
console.log('\nnpcIsStrangerTo (willingness.js) — the actual bug this feature fixes');

check("with no prior relationship, a fresh roommate IS a stranger (today's unchanged default)", api(`
  npcIsStrangerTo(null, __base, 'player') === true
`));
check('with ANY prior relationship applied, they are no longer a stranger — no special case needed, the axes alone clear the gate', api(`
  kinds_check = PRIOR_RELATIONSHIP_KINDS.every(k => npcIsStrangerTo(null, applyPriorRelationship(__base, k.id, 1), 'player') === false);
  kinds_check
`));

// ---------------------------------------------------------------------------
console.log('\ngenerateCast — the real Sandbox entry point, and backward compatibility');

api(`
  __cast = generateCast(20260921, 3, 0, [null, { priorRelationship: 'close_friend' }, {}]);
  __plain = generateCast(20260921, 3, 0);
  __plainIds = Object.keys(__plain.npcs);
  __castIds = Object.keys(__cast.npcs);
`);
check('a slot with no partial at all is BYTE-IDENTICAL to generating with no partials array', api(`
  JSON.stringify(__cast.npcs[__castIds[0]].relPlayer) === JSON.stringify(__plain.npcs[__plainIds[0]].relPlayer)
`), 'the common case (no authored relationship) must be provably unchanged');
check('an empty partial object {} is also a no-op (slot 3, index 2)', api(`
  JSON.stringify(__cast.npcs[__castIds[2]].relPlayer) === JSON.stringify(__plain.npcs[__plainIds[2]].relPlayer)
`));
check('the authored slot (index 1) actually got the close_friend treatment', api(`
  __cast.npcs[__castIds[1]].relPlayer.priorRelationshipKind === 'close_friend'
  && npcIsStrangerTo(null, __cast.npcs[__castIds[1]], 'player') === false
`));

// ---------------------------------------------------------------------------
console.log('\nbuildNpcBlockV2 (llm.js) — told to the model plainly, on day 1 itself');

api(`
  __sibNpc = { ...applyPriorRelationship(__h.npcs[__ids[0]], 'sibling', 1), id: __ids[0],
               name: __h.npcs[__ids[0]].bible.name, castWebSlice: [], memory: __h.npcs[__ids[0]].memory };
  __sibBlock = buildNpcBlockV2(__sibNpc, 'hello', 'scene', 1);
`);
check('the relationship kind is stated in plain language', api(`__sibBlock.includes('They are your sibling.')`));
check('daysKnown is already positive and stated on day 1 itself — the whole point of backdating firstMetDay', api(`
  /You've known them for \\d+ days\\./.test(__sibBlock) && !__sibBlock.includes('known them for 0 days')
`));
check('a plain roommate (no prior relationship) gets neither line, unchanged from before this feature', api(`
  (() => {
    const plainNpc = { ...__base, id: __ids[0], name: __h.npcs[__ids[0]].bible.name, castWebSlice: [], memory: __h.npcs[__ids[0]].memory };
    const block = buildNpcBlockV2(plainNpc, 'hello', 'scene', 1);
    return !block.includes('They are your') && !block.includes('known them for');
  })()
`));

// ---------------------------------------------------------------------------
console.log('\nNo code branches on family status (the locked "fully emergent" decision)');

const willingnessSrc = srcOf('willingness.js');
check('willingness.js never reads priorRelationshipKind, category, or family at all', api(`true`) &&
      !/priorRelationshipKind/.test(willingnessSrc) &&
      !/\bcategory\s*===\s*['"]family['"]/.test(willingnessSrc) &&
      !/\bisFamily\b/.test(willingnessSrc),
      'a hard gate or a special case here would contradict the locked decision');
const notCheckedFiles = ['npc.js', 'sim.js', 'cognition.js', 'drives.js'].map(f => ({ f, src: srcOf(f) }));
check("no OTHER file branches on a family/isFamily concept either (sim.js's own PRIOR_RELATIONSHIP_KINDS table and applyPriorRelationship are data/assignment, not a conditional on category)", api(`true`) &&
      notCheckedFiles.every(({ f, src }) => {
        if (f === 'sim.js') {
          // sim.js legitimately CONTAINS the word (the table's own `category`
          // key and this file's comments) — what must never exist is a
          // conditional keyed on it.
          return !/if\s*\([^)]*category\s*===\s*['"]family['"]/.test(src) && !/\bisFamily\s*\(/.test(src);
        }
        return !/priorRelationshipKind/.test(src) && !/\bisFamily\b/.test(src);
      }));

// ---------------------------------------------------------------------------
console.log('\nSandbox UI wiring (menu.js) — source-grepped, no DOM in this harness');

const menuSrc = srcOf('menu.js');
check('the Identity tab offers a Relationship-with-you picker sourced from PRIOR_RELATIONSHIP_KINDS',
      /PRIOR_RELATIONSHIP_KINDS\.map\(k => \(\{ value: k\.id, label: k\.label \}\)\)/.test(menuSrc));
check("the field write-back whitelist includes 'priorRelationship'",
      /fieldPath === 'priorRelationship'/.test(menuSrc));
check("roommateAuthoredFields reports it when set, like the other backstory fields",
      /if \(touched\(p\.priorRelationship\)\) out\.push\('priorRelationship'\)/.test(menuSrc));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
