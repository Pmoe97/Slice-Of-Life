// Peek framing audit (2026-09-05) — the narration and the image must describe
// the same moment.
//
//   node src/src/dev/verify/verify-peek-prompt.js
//
// User report: peeking on a sleeping NPC showed her awake, eyes open and
// standing; a shower peek had no water in it; a peek that narrated "filming
// herself" produced an image with no camera in it.
//
// The act phrase was never the problem — PEEK_VIEW_ACT is read by BOTH
// composePeekViewLine (peek.js) and composePeekPrompt (image.js). The problem
// was everything wrapped around it: one unconditional framing clause
// ("mid-motion, absorbed in what they are doing") and one unconditional
// negative ("static portrait", "facing the camera", "posing for the camera"),
// which between them contradicted 17 of the 58 acts. A sleeping woman was
// described to the model as "asleep in bed, mid-motion" with nothing anywhere
// saying eyes closed or lying down, and someone filming themselves was asked
// to face a camera in the positive and forbidden from it in the negative.
//
// THE ASSERTION THAT WOULD HAVE CAUGHT BOTH is section 1: for every act, no
// phrase in the composed positive prompt may also appear in that act's own
// composed negative. It is cheap, it is total, and it is the shape of the bug.
//
// Design brief for the sleeping frame (the user, 2026-09-05): a sleeping
// subject does not have to be an INTERESTING subject, but they must be a
// LEGIBLE one — read as a body at rest, not as a dark shape under a duvet.
// Seeing a nude sleeper's form is the reward for looking, and that is achieved
// by making them VISIBLE, not by posing them. Section 4 holds both halves:
// legibility is asserted, and so is the absence of sexualising language.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'npc.js', 'world.js', 'signals.js',
             'relationships.js', 'willingness.js', 'image.js', 'peek.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  var currentGameState = null;
  root.generateImage = () => new Promise(() => {});
  __mk = (mature) => {
    const h = SIM_generateHouse(4242, 3);
    const g = { meta:{seed:h.seed, clock:h.clock, contentConfig:null, sessionLog:[]},
                player:h.player, npcs:h.npcs, world:h.world, objects:h.objects };
    g.meta.contentConfig = { contentFlags: { mature: mature !== false } };
    return g;
  };
  __id = (g) => Object.keys(g.npcs)[0];
  __as = (g, id, activity, clothing, room) => {
    g.npcs[id] = { ...g.npcs[id], location: room || 'bedroom_1',
                   activity, clothing: clothing || 'dressed' };
    return g.npcs[id];
  };
  // Every act row, composed both ways from the same state.
  __sweep = (clothing) => {
    const g = __mk(true); const id = __id(g);
    const out = [];
    for (const actKey of Object.keys(PEEK_VIEW_ACT)) {
      if (actKey === '_default') continue;
      const npc = __as(g, id, actKey, clothing || 'dressed', 'bedroom_1');
      const focus = { npcId: id, npc };
      out.push({
        actKey,
        prompt: composePeekPrompt(g, 'bedroom_1', npc, actKey, id),
        negative: composePeekNegative(actKey),
        narration: composePeekViewLine(g, { roomId: 'bedroom_1' }, focus),
        def: PEEK_VIEW_ACT[actKey],
      });
    }
    return out;
  };
`);

// ---------------------------------------------------------------- 1
console.log('\n1. THE RULE: no act may ask for a thing its own negative forbids');
{
  const rows = J('__sweep()');
  const conflicts = [];
  for (const r of rows) {
    const prompt = r.prompt.toLowerCase();
    for (const term of r.negative.split(', ')) {
      // Single words like "text" or "blurry" are quality terms and appear in
      // no prompt by construction; only the multi-word framing terms can
      // genuinely collide, and those are the ones that caused the bug.
      if (term.split(' ').length < 2) continue;
      let from = 0;
      for (;;) {
        const at = prompt.indexOf(term, from);
        if (at < 0) break;
        // "not looking at the viewer" is the prompt AGREEING with the
        // negative, not fighting it.
        const before = prompt.slice(Math.max(0, at - 4), at);
        if (before !== 'not ') conflicts.push(`${r.actKey}: prompt says "${term}" and negative forbids it`);
        from = at + term.length;
      }
    }
  }
  check('every act composes a prompt that agrees with its own negative',
    conflicts.length === 0, JSON.stringify([...new Set(conflicts)], null, 1));
  check('...across all 57 named acts', rows.length > 50, `${rows.length} acts swept`);
}

// ---------------------------------------------------------------- 2
console.log('\n2. a STATIC act is never described as mid-motion');
{
  // "Static" is what an act DECLARES, not what a regex guesses from its verb.
  // The in-bed sexual acts read as static to a pattern match and are not —
  // they keep the default posture on purpose, and an earlier version of this
  // test wrongly failed them.
  const r = J(`(() => {
    const rows = __sweep();
    const declared = rows.filter(x => !!x.def.posture);
    return {
      declaredKeys: declared.map(x => x.actKey),
      leakedDefault: declared.filter(x => x.prompt.indexOf(PEEK_FRAMING.defaultPosture) >= 0)
        .map(x => x.actKey),
      sleepMidMotion: rows.filter(x => ['sleeping','napping'].indexOf(x.actKey) >= 0)
        .filter(x => /mid-motion/.test(x.prompt)).map(x => x.actKey),
      inBedKeepsMotion: rows.filter(x => ['having sex','sex','quickie','masturbating'].indexOf(x.actKey) >= 0)
        .every(x => x.prompt.indexOf(PEEK_FRAMING.defaultPosture) >= 0),
      defaultPosture: PEEK_FRAMING.defaultPosture,
    };
  })()`);
  check('the acts that declare their own posture are found',
    r.declaredKeys.length >= 3, JSON.stringify(r.declaredKeys));
  check('...and none of them also emits the default posture',
    r.leakedDefault.length === 0, JSON.stringify(r.leakedDefault));
  check('sleeping and napping in particular never say "mid-motion"',
    r.sleepMidMotion.length === 0, JSON.stringify(r.sleepMidMotion));
  check('...while the in-bed SEXUAL acts deliberately keep it — they are motion',
    r.inBedKeepsMotion);
  check('...and the default posture, which most acts still use, is the mid-motion one',
    /mid-motion/.test(r.defaultPosture), r.defaultPosture);
}

// ---------------------------------------------------------------- 3
console.log('\n3. an act that declares no image fields composes EXACTLY what it always did');
{
  const r = J(`(() => {
    const g = __mk(true); const id = __id(g);
    const npc = __as(g, id, 'reading', 'dressed', 'living_room');
    const prompt = composePeekPrompt(g, 'living_room', npc, 'reading', id);
    const def = PEEK_VIEW_ACT['reading'];
    return {
      untouched: !def.posture && !def.staging && !def.dropNegative && !def.addNegative,
      hasDefaultPosture: prompt.indexOf(PEEK_FRAMING.defaultPosture) >= 0,
      negativeIsBase: composePeekNegative('reading') === PEEK_FRAMING.negative.join(', '),
      // the framing that was added 2026-08-30 and must not be lost
      candid: /completely unaware of being watched/.test(prompt)
        && /body angled away from the door/.test(prompt)
        && /natural unposed body language/.test(prompt),
    };
  })()`);
  check('`reading` declares none of the new fields', r.untouched);
  check('...so it keeps the default posture', r.hasDefaultPosture);
  check('...and the un-subtracted base negative', r.negativeIsBase);
  check('...and the 2026-08-30 candid framing is still intact', r.candid);
}

// ---------------------------------------------------------------- 4
console.log('\n4. the sleeping frame: LEGIBLE, and deliberately not lurid');
{
  const r = J(`(() => {
    const g = __mk(true); const id = __id(g);
    const dressed = __as(g, id, 'sleeping', 'sleepwear', 'bedroom_1');
    const clothedPrompt = composePeekPrompt(g, 'bedroom_1', dressed, 'sleeping', id);
    const nude = __as(g, id, 'sleeping', 'nude', 'bedroom_1');
    const nudePrompt = composePeekPrompt(g, 'bedroom_1', nude, 'sleeping', id);
    const neg = composePeekNegative('sleeping');
    const napNeg = composePeekNegative('napping');
    // The words this frame must NOT reach for. The brief was explicit: seeing
    // a nude sleeper is a reward for looking, earned by VISIBILITY, not by
    // posing them or narrating them as an invitation.
    // Word-boundary matched: the framing legitimately says "natural UNPOSED
    // body language", which a substring check reads as "posed".
    const lurid = ['sensual','seductive','inviting','erotic','provocative','alluring','sultry',
                   'legs spread','posed','tempting','arousing'];
    const says = (text, word) => new RegExp('(^|[^a-z])' + word + '($|[^a-z])', 'i').test(text);
    return {
      eyesClosed: /eyes closed/.test(clothedPrompt),
      lying: /lying on their side/.test(clothedPrompt),
      still: /still and at rest/.test(clothedPrompt),
      legible: /clearly visible/.test(clothedPrompt) && /well lit/.test(clothedPrompt),
      coversOff: /covers pushed down and away/.test(clothedPrompt),
      noMidMotion: !/mid-motion/.test(clothedPrompt),
      bansAwake: /awake/.test(neg) && /eyes open/.test(neg) && /standing/.test(neg),
      bansSilhouette: /silhouette/.test(neg) && /pitch dark/.test(neg),
      allowsStillness: !/static portrait/.test(neg) && !/standing straight/.test(neg),
      napAlso: /eyes closed/.test(composePeekPrompt(g, 'bedroom_1',
        __as(g, id, 'napping', 'sleepwear', 'bedroom_1'), 'napping', id))
        && !/static portrait/.test(napNeg),
      luridInClothed: lurid.filter(w => says(clothedPrompt, w)),
      luridInNude: lurid.filter(w => says(nudePrompt, w)),
      // the nude body still reaches the prompt — that is the reward half
      nudeNamed: /naked|nude|bare/.test(nudePrompt.toLowerCase()),
      sameStaging: /eyes closed/.test(nudePrompt) && /clearly visible/.test(nudePrompt),
    };
  })()`);
  check('the sleeper has her eyes closed and is lying down', r.eyesClosed && r.lying);
  check('...and is still, not mid-motion', r.still && r.noMidMotion);
  check('...and is LEGIBLE: clearly visible, well lit, covers off her',
    r.legible && r.coversOff);
  check('the negative bans the reported failure — awake, eyes open, standing', r.bansAwake);
  check('...and the other one: a dark silhouette lost under the bedding', r.bansSilhouette);
  check('...while ALLOWING stillness, which the base negative used to forbid',
    r.allowsStillness);
  check('napping gets the same treatment', r.napAlso);
  check('a nude sleeper is still described as nude — that is the reward for looking',
    r.nudeNamed && r.sameStaging);
  check('...but nothing in either frame is sexualising language',
    r.luridInClothed.length === 0 && r.luridInNude.length === 0,
    JSON.stringify({ clothed: r.luridInClothed, nude: r.luridInNude }));
}

// ---------------------------------------------------------------- 5
console.log('\n5. the shower frame actually has water in it');
{
  const r = J(`(() => {
    const g = __mk(true); const id = __id(g);
    const npc = __as(g, id, 'showering', 'nude', 'bathroom_a');
    const prompt = composePeekPrompt(g, 'bathroom_a', npc, 'showering', id);
    return {
      water: /running water/.test(prompt),
      wet: /wet skin/.test(prompt) && /soaked hair/.test(prompt),
      suds: /soap suds/.test(prompt),
      steam: /steam/.test(prompt),
      droplets: /water droplets/.test(prompt),
      roomCase: /Interior of the Bathroom A/.test(prompt),
    };
  })()`);
  check('running water', r.water);
  check('wet skin and soaked hair', r.wet);
  check('soap suds', r.suds);
  check('steam and droplets', r.steam && r.droplets);
  check('and the room name is no longer lowercased into "bathroom a"', r.roomCase);
}

// ---------------------------------------------------------------- 6
console.log('\n6. the camera acts: staged rather than fought');
{
  const r = J(`(() => {
    const g = __mk(true); const id = __id(g);
    const keys = ['filming', 'filming by the pool', 'filming together', 'on a video call',
                  'in a standup', 'recording a take', 'on a client call', 'laying down a take'];
    const out = {};
    for (const k of keys) {
      const npc = __as(g, id, k, 'dressed', 'bedroom_1');
      const neg = composePeekNegative(k);
      out[k] = {
        staged: /camera on a tripod|facing a laptop screen/.test(composePeekPrompt(g, 'bedroom_1', npc, k, id)),
        sideOn: /side-on to the door/.test(composePeekPrompt(g, 'bedroom_1', npc, k, id)),
        dropsFacing: !/facing the camera/.test(neg),
        keepsViewer: /looking at the viewer/.test(neg),
      };
    }
    // and the one term no act may ever drop, even if it tries
    const cheat = (() => {
      const saved = PEEK_VIEW_ACT.reading.dropNegative;
      PEEK_VIEW_ACT.reading.dropNegative = ['looking at the viewer'];
      const neg = composePeekNegative('reading');
      PEEK_VIEW_ACT.reading.dropNegative = saved;
      return /looking at the viewer/.test(neg);
    })();
    return { out, keys, cheat };
  })()`);
  const bad = r.keys.filter(k => !r.out[k].staged || !r.out[k].sideOn);
  check('every camera act stages a real camera, positioned away from the door',
    bad.length === 0, JSON.stringify(bad));
  check('...and stops forbidding "facing the camera", which was cancelling the act',
    r.keys.every(k => r.out[k].dropsFacing));
  check('...while still forbidding "looking at the viewer" — the peeker is not the camera',
    r.keys.every(k => r.out[k].keepsViewer));
  check('and no act can drop "looking at the viewer" even by declaring it', r.cheat);
}

// ---------------------------------------------------------------- 7
console.log('\n7. narration and image still read the SAME act — the thing that was never broken');
{
  const r = J(`(() => {
    const rows = __sweep('nude');
    const divergent = [];
    for (const row of rows) {
      const def = row.def;
      // whichever column the gate chose, the prompt and the line must carry it
      const inPrompt = row.prompt.indexOf(def.explicit) >= 0 || row.prompt.indexOf(def.safe) >= 0;
      const inLine = row.narration.indexOf(def.explicit) >= 0 || row.narration.indexOf(def.safe) >= 0;
      if (!inPrompt || !inLine) divergent.push(row.actKey + (inPrompt ? '' : ' [prompt]') + (inLine ? '' : ' [line]'));
    }
    return { divergent, sample: rows.find(x => x.actKey === 'filming') };
  })()`);
  check('every act phrase reaches BOTH the prompt and the narration',
    r.divergent.length === 0, JSON.stringify(r.divergent, null, 1));
  check('...including the one the user caught: narration says filming, so does the prompt',
    /filming themselves/.test(r.sample.narration) && /filming themselves/.test(r.sample.prompt));
}

// ---------------------------------------------------------------- 8
console.log('\n8. the cache: changed prompts cannot be served old pixels');
{
  const r = J(`(() => {
    const g = __mk(true); const id = __id(g);
    const npc = __as(g, id, 'sleeping', 'sleepwear', 'bedroom_1');
    const key = composePeekKey(g, 'bedroom_1', npc, 'sleeping');
    const other = composePeekKey(g, 'bedroom_1', __as(g, id, 'showering', 'nude', 'bathroom_a'), 'showering');
    return { key, version: PEEK_PROMPT_VERSION, imageVersion: IMAGE_PROMPT_VERSION,
             foldsVersion: key.indexOf(PEEK_PROMPT_VERSION) >= 0, differs: key !== other };
  })()`);
  check('the peek key folds a peek-only prompt version', r.foldsVersion, r.key);
  check('...which is separate from IMAGE_PROMPT_VERSION, so only peek frames go stale',
    r.version !== r.imageVersion && !!r.version && !!r.imageVersion,
    `${r.version} vs ${r.imageVersion}`);
  check('and two acts still key differently', r.differs);

  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const img = strip(fs.readFileSync(path.join(SRC, 'image.js'), 'utf8'));
  check('both peek generation sites send the per-act negative, not the raw base',
    (img.match(/composePeekNegative\(actKey\)/g) || []).length >= 2);
  check('IMAGE_NEGATIVE.peek derives from PEEK_FRAMING rather than duplicating it',
    /peek: PEEK_FRAMING\.negative\.join/.test(img));
}

// ---------------------------------------------------------------- 9
console.log('\n9. every activity the sim can produce has an act row (the pre-existing rule)');
{
  const r = J(`(() => {
    const missing = [];
    for (const [vocation, list] of Object.entries(HOME_WORK_ACTIVITIES)) {
      for (const a of list) if (!PEEK_VIEW_ACT[a]) missing.push(vocation + ': ' + a);
    }
    return { missing, total: Object.keys(PEEK_VIEW_ACT).length };
  })()`);
  check('every HOME_WORK_ACTIVITIES string has a PEEK_VIEW_ACT row',
    r.missing.length === 0, JSON.stringify(r.missing));
  check('...and the table is the size the audit measured', r.total >= 58, String(r.total));
}

console.log('\n==============================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('==============================================');
process.exit(fail === 0 ? 0 : 1);
