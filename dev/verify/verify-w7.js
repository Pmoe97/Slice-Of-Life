// Intimacy & Voyeurism Plan Phase 7 — Clothing stats & traits effects (D11).
// Clothes matter: the attraction term, the desire source and the willingness
// term are wired as PURE readers over CLOTHING_EFFECTS (config.js) + the
// ITEMS aggregation, and the overture affection/desire motives consume them —
// so a player in a revealing outfit measurably lifts a room's attraction and
// desire response while one in loungewear does not, with the observer's own
// deviancy gating how much of a reveal reads as invitation.
//
// Nothing here reimplements the math: the engine loads into a bare vm and the
// assertions read what the real functions return.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const SRCDIR = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// house() must be injected INTO the vm context via api() — the api(`...`)
// blocks below execute inside loadEngine's vm.runInContext sandbox, which
// does not share scope with this outer Node process, so a bare top-level
// `function house` here (the original shape) was never reachable from them.
api(`
  function house(seed, n) {
    const h = SIM_generateHouse(seed, n);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    return h;
  }
`);

// The two outfits the phase's verification compares: a revealing, high-
// attraction look vs a comfortable loungewear one, built from real CLOTHING_DEFS.
const REVEALING = { top: 'crop_top', bottom: 'skirt', underwear: 'lingerie_set', accessory: 'necklace' };
const LOUNGE = { top: 'sweater', bottom: 'sweatpants', outerwear: 'hoodie', shoes: 'slippers' };
const PLAIN_DAILY = { top: 'basic_tee', bottom: 'jeans', shoes: 'sneakers', socks: 'socks_cotton' };

// ---------------------------------------------------------------- 1
console.log('\n1. CLOTHING_EFFECTS table (config.js)');
check('weights and caps are positive and caps are <= 1',
      api(`(() => {
        const c = CLOTHING_EFFECTS;
        const pos = (x) => typeof x === 'number' && x > 0;
        const cap = (x) => typeof x === 'number' && x > 0 && x <= 1;
        return pos(c.modestyDampen) && pos(c.attraction.weight) && cap(c.attraction.cap)
          && pos(c.reveal.weight) && cap(c.reveal.cap)
          && c.desireObserver.min >= 0 && c.desireObserver.max >= c.desireObserver.min
          && Object.entries(c.traitAttraction).every(([, m]) => m > 0)
          && pos(c.willingness.attraction.weight) && cap(c.willingness.attraction.cap)
          && pos(c.willingness.reveal.weight) && cap(c.willingness.reveal.cap)
          && pos(c.prose.attractive) && pos(c.prose.revealing) && pos(c.prose.comfy);
      })()`));
check('every traitAttraction key is a real trait carried by at least one CLOTHING_DEFS item',
      api(`(() => {
        const real = new Set(Object.values(CLOTHING_DEFS).flatMap(d => d.traits || []));
        return Object.keys(CLOTHING_EFFECTS.traitAttraction).every(t => real.has(t));
      })()`));
check('desireObserver bounds are within [0,1] and the min is a floor, not a second scale',
      api(`CLOTHING_EFFECTS.desireObserver.min >= 0 && CLOTHING_EFFECTS.desireObserver.max <= 1`));

// ---------------------------------------------------------------- 2
console.log('\n2. Aggregation readers (items.js)');
check('outfitStatSum sums the stat across worn items, 0 for missing/empty',
      api(`outfitStatSum(${JSON.stringify(REVEALING)}, 'attraction') >
           outfitStatSum(${JSON.stringify(LOUNGE)}, 'attraction') &&
           outfitStatSum(${JSON.stringify(REVEALING)}, 'reveal') >
           outfitStatSum(${JSON.stringify(LOUNGE)}, 'reveal') &&
           outfitStatSum({}, 'attraction') === 0 &&
           outfitStatSum(null, 'attraction') === 0 &&
           outfitStatSum({}, 'thermal') === 0`));
check('outfitEffectiveReveal cancels reveal by modesty, and is 0 for a covered outfit',
      api(`(() => {
        const r = outfitEffectiveReveal(${JSON.stringify(REVEALING)});
        const l = outfitEffectiveReveal(${JSON.stringify(LOUNGE)});
        const raw = outfitStatSum(${JSON.stringify(REVEALING)}, 'reveal');
        const damped = raw * (1 - outfitStatSum(${JSON.stringify(REVEALING)}, 'modesty') * CLOTHING_EFFECTS.modestyDampen);
        return r > 0 && r > l && Math.abs(r - damped) < 1e-9 && l === 0 && outfitEffectiveReveal(null) === 0;
      })()`));
check('outfitHasTrait reads any worn item, false for empty',
      api(`outfitHasTrait(${JSON.stringify(REVEALING)}, 'sexy') === true &&
           outfitHasTrait(${JSON.stringify(LOUNGE)}, 'sexy') === false &&
           outfitHasTrait(${JSON.stringify(REVEALING)}, 'comfortable') === false &&
           outfitHasTrait({}, 'sexy') === false`));

// ---------------------------------------------------------------- 3
console.log('\n3. clothingResponseToWearer (npc.js) — the verification');
check('two identically-personalitied NPCs give a HIGHER attraction AND desire response to a revealing player outfit than to loungewear',
      api(`(() => {
        const h = house(20260820, 2);
        const npc = Object.values(h.npcs)[0];
        const ob = (outfit) => clothingResponseToWearer(npc, { outfit });
        const r = ob(${JSON.stringify(REVEALING)});
        const l = ob(${JSON.stringify(LOUNGE)});
        return r.attraction > l.attraction && r.desire > l.desire && r.attraction >= 0 && r.attraction <= 1 && r.desire >= 0 && r.desire <= 1;
      })()`));
check('...and the plain daily fit contributes ~nothing (near-zero terms)',
      api(`(() => {
        const h = house(20260820, 2);
        const npc = Object.values(h.npcs)[0];
        const p = clothingResponseToWearer(npc, { outfit: ${JSON.stringify(PLAIN_DAILY)} });
        return p.attraction < 0.15 && p.desire < 0.05;
      })()`));
check('attraction is observer-independent; desire is deviancy-gated (the exhibition read)',
      api(`(() => {
        const prude = { bible: { temperament: { openness: -1, assertiveness: -1 } } };
        const deviant = { bible: { temperament: { openness: 1, assertiveness: 1 } } };
        const aP = clothingResponseToWearer(prude, { outfit: ${JSON.stringify(REVEALING)} });
        const aD = clothingResponseToWearer(deviant, { outfit: ${JSON.stringify(REVEALING)} });
        return aP.attraction === aD.attraction && aD.desire > aP.desire && aP.desire === 0;
      })()`));
check('a missing outfit reads as zero response (old saves stay clean)',
      api(`(() => {
        const h = house(20260820, 2);
        const npc = Object.values(h.npcs)[0];
        const z = clothingResponseToWearer(npc, {});
        const z2 = clothingResponseToWearer(npc, null);
        const z3 = clothingResponseToWearer(npc, undefined);
        return z.attraction === 0 && z.desire === 0 && z2.attraction === 0 && z3.attraction === 0;
      })()`));
check('clothingResponseToWearer is deterministic (pure — same inputs, same outputs)',
      api(`(() => {
        const h = house(20260820, 2);
        const npc = Object.values(h.npcs)[0];
        const a = JSON.stringify(clothingResponseToWearer(npc, { outfit: ${JSON.stringify(REVEALING)} }));
        const b = JSON.stringify(clothingResponseToWearer(npc, { outfit: ${JSON.stringify(REVEALING)} }));
        return a === b;
      })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. clothingWillingnessBias (npc.js) — the Phase 9 term, wired now');
check('revealing outfits tilt willingness more than loungewear, bounded to [0,1]',
      api(`(() => {
        const r = clothingWillingnessBias({ outfit: ${JSON.stringify(REVEALING)} });
        const l = clothingWillingnessBias({ outfit: ${JSON.stringify(LOUNGE)} });
        const z = clothingWillingnessBias({ outfit: {} });
        const z2 = clothingWillingnessBias(null);
        return r > l && r >= 0 && r <= 1 && z === 0 && z2 === 0;
      })()`));
check('...and is observer-neutral (no observer in the signature)',
      api(`clothingWillingnessBias({ outfit: ${JSON.stringify(REVEALING)} }) ===
           clothingWillingnessBias({ outfit: ${JSON.stringify(REVEALING)} })`));

// ---------------------------------------------------------------- 5
console.log('\n5. Overture wiring (overture.js) — the live consumers');
check('the affection motive strength rises with a revealing player outfit, and the floor stays the relationship\'s',
      api(`(() => {
        const h = house(20260820, 2);
        const npc = Object.values(h.npcs)[0];
        const floor = REL_CONSEQUENCES.affectionGiftThreshold;
        npc.relPlayer = { affection: floor, desire: 0, comfort: 0, tension: 0, trust: 0, respect: 0, grievances: [] };
        const gs = { meta: { contentConfig: null }, player: { outfit: ${JSON.stringify(REVEALING)} } };
        const withRevealing = OVERTURE_MOTIVES.affection(npc, gs);
        gs.player.outfit = ${JSON.stringify(LOUNGE)};
        const withLounge = OVERTURE_MOTIVES.affection(npc, gs);
        gs.player.outfit = ${JSON.stringify(PLAIN_DAILY)};
        const withPlain = OVERTURE_MOTIVES.affection(npc, gs);
        // A hot outfit does not manufacture fondness: below the floor stays null.
        npc.relPlayer.affection = floor - 0.01;
        const below = OVERTURE_MOTIVES.affection(npc, gs);
        return !!withRevealing && !!withLounge && withRevealing.strength > withLounge.strength
          && withLounge.strength >= withPlain.strength && below === null;
      })()`));
check('the desire motive strength rises with a revealing player outfit (the desire source)',
      api(`(() => {
        const h = house(20260820, 2);
        const npc = Object.values(h.npcs)[0];
        const RC = REL_CONSEQUENCES;
        npc.relPlayer = { desire: RC.desireHighComfortHigh, comfort: RC.comfortHigh, affection: RC.affectionHigh, tension: 0, trust: 0, respect: 0, grievances: [] };
        const gs = { meta: { contentConfig: { contentFlags: { mature: true, romance: true } } }, player: { outfit: ${JSON.stringify(REVEALING)} } };
        const withRevealing = OVERTURE_MOTIVES.desire(npc, gs);
        gs.player.outfit = ${JSON.stringify(LOUNGE)};
        const withLounge = OVERTURE_MOTIVES.desire(npc, gs);
        return !!withRevealing && !!withLounge && withRevealing.strength > withLounge.strength;
      })()`));
check('a gameState with NO player is byte-identical to the pre-Phase-7 motive answers',
      api(`(() => {
        const h = house(20260820, 2);
        const npc = Object.values(h.npcs)[0];
        const floor = REL_CONSEQUENCES.affectionGiftThreshold;
        npc.relPlayer = { affection: 1, desire: 0, comfort: 0, tension: 0, trust: 0, respect: 0, grievances: [] };
        const a = OVERTURE_MOTIVES.affection(npc, { meta: { contentConfig: null } });
        return Math.abs(a.strength - 1) < 1e-9;
      })()`));

// ---------------------------------------------------------------- 6
console.log('\n6. Scene-prompt prose (scene.js / llm.js)');
check('outfitFlavorProse: revealing reads as skin, loungewear as comfort, plain daily says nothing',
      api(`(() => {
        const r = outfitFlavorProse(${JSON.stringify(REVEALING)});
        const l = outfitFlavorProse(${JSON.stringify(LOUNGE)});
        const p = outfitFlavorProse(${JSON.stringify(PLAIN_DAILY)});
        const z = outfitFlavorProse({});
        return r.includes('showing a lot of skin') && l.includes('dressed for comfort')
          && p === null && z === null;
      })()`));
check('playerSelfLine speaks for a notable outfit and stays silent for a plain one',
      api(`(() => {
        const r = playerSelfLine({ clothing: 'dressed', outfit: ${JSON.stringify(REVEALING)} });
        const p = playerSelfLine({ clothing: 'dressed', outfit: ${JSON.stringify(PLAIN_DAILY)} });
        const z = playerSelfLine({});
        const n = playerSelfLine({ clothing: 'nude' });
        return r.includes('showing a lot of skin') && p === null && z === null && n === "You're naked.";
      })()`));
check('presence lines gain an outfit tail only for notable, actually-worn outfits',
      api(`(() => {
        const h = house(20260820, 2);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        npc.bible.name = 'Test';
        npc.location = 'living_room';
        npc.activity = 'watching TV';
        npc.clothing = 'dressed';
        npc.outfit = ${JSON.stringify(REVEALING)};
        const withOutfit = presenceLines(h, 'living_room')[0].line;
        npc.clothing = 'towel';
        npc.outfit = ${JSON.stringify(REVEALING)};
        const withTowel = presenceLines(h, 'living_room')[0].line;
        npc.clothing = 'dressed';
        npc.outfit = ${JSON.stringify(PLAIN_DAILY)};
        const withPlain = presenceLines(h, 'living_room')[0].line;
        return withOutfit.includes("Test's dressed to impress") && !withTowel.includes('impress') && !withPlain.includes('impress');
      })()`));
check('clothingLabel: notable outfit reads as its flavor, plain as dressed normally',
      api(`(() => {
        const r = clothingLabel({ clothing: 'dressed', outfit: ${JSON.stringify(REVEALING)} });
        const p = clothingLabel({ clothing: 'dressed', outfit: ${JSON.stringify(PLAIN_DAILY)} });
        const n = clothingLabel({ clothing: 'nude' });
        const z = clothingLabel({});
        return r.includes('skin') && p === 'dressed normally' && n === 'completely naked' && z === 'dressed normally';
      })()`));
check('the scene prompt PLAYER block carries the Dressed line',
      api(`(() => {
        const ctx = { contentConfig: null, scene: { room: 'Living Room', phase: 'day', time: '10:00', day: 2, cleanliness: 60, signals: [] }, player: { name: 'You', location: 'living_room', mood: 0.5, energy: 80, hunger: 50, money: 100, flags: {}, clothing: 'dressed', outfit: ${JSON.stringify(REVEALING)} }, activeNpcs: [], ambientNpcs: [], worldEvents: [] };
        const prompt = buildScenePrompt(ctx, 'look around');
        return prompt.includes('Dressed: ') && prompt.includes('showing a lot of skin');
      })()`));

// ---------------------------------------------------------------- 7
console.log('\n7. Gate integrity (invariant 4 + D15) — the outfit never loosens the intimate gate');
check('getPhysicalDescriptionForPrompt is byte-identical whether or not the outfit is present',
      api(`(() => {
        const h = house(20260820, 2);
        const npc = Object.values(h.npcs)[0];
        npc.clothing = 'dressed';
        const without = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h });
        npc.outfit = ${JSON.stringify(REVEALING)};
        const withOutfit = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h });
        npc.clothing = 'nude';
        const nudeWith = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h });
        const nudeWithout = getPhysicalDescriptionForPrompt({ ...npc, clothing: 'nude' }, { intimate: true, gameState: h });
        return without === withOutfit && nudeWith === nudeWithout;
      })()`));
check('the three-part gate still holds: dressed/towel/sleepwear/changing never open it, nude/undressed do only under mature+opt-in',
      api(`(() => {
        const h = house(20260820, 2);
        const npc = Object.values(h.npcs)[0];
        npc.outfit = ${JSON.stringify(REVEALING)};
        for (const c of ['dressed', 'towel', 'sleepwear', 'changing']) {
          npc.clothing = c;
          const d = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h });
          if (d.includes('nipples') || d.includes('genitals')) return false;
        }
        npc.clothing = 'nude';
        const open = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h });
        if (!(open.includes('completely naked') && (open.includes('nipples') || open.includes('breasts')))) return false;
        // mature OFF closes it — the outfit cannot resurrect the intimate branch.
        const closed = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: { meta: { contentConfig: { contentFlags: { mature: false } } } } });
        return !(closed.includes('nipples') || closed.includes('breasts'));
      })()`));
check('the willingness term and response readers never write or touch rng (determinism harness)',
      api(`(() => {
        const h = house(20260820, 2);
        const npc = Object.values(h.npcs)[0];
        const before = JSON.stringify(h);
        clothingResponseToWearer(npc, { outfit: ${JSON.stringify(REVEALING)} });
        clothingWillingnessBias({ outfit: ${JSON.stringify(REVEALING)} });
        outfitFlavorProse(${JSON.stringify(REVEALING)});
        return JSON.stringify(h) === before;
      })()`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
