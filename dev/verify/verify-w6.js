// Intimacy & Voyeurism Plan Phase 6 — NPC wardrobe AI + change_clothes drive +
// nudity gating (D11). Drives the REAL resolveTick over REAL generated houses,
// plus the pure rules (NPC.js) and tables (config.js). Nothing about the
// outfit/nudity math is reimplemented: the whole engine loads into a bare vm
// and the assertions read what actually happened.
//
// Note (Phase 6 session): this file is the durable Node-side artifact. The
// same assertions were ALSO run on the live Perchance page (browser_eval) —
// same seeds, same numbers — so the browser is the source of truth and this
// just makes the checks reproducible offline.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const SRCDIR = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const { api } = loadEngine();
// Pulled into outer scope because section 6+'s checks run plain JS .every()/
// .map() over real values simulate() already extracted from the vm (not
// api(`...`) strings) — CLOTHING_STATES only exists inside the sandbox, so a
// bare reference to it from this outer Node process was never defined.
const CLOTHING_STATES = api('CLOTHING_STATES');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// A fresh generated house with the meta shape the real gameState carries.
// `startDay` lets the harness begin on a Saturday (day 5 is the first
// weekend day: getWeekday(day) = (day-1)%7, 5=Sat,6=Sun) so the 3-day run
// covers two leisure-block days AND a weekday work block.
// Injected into the vm context — the checks below call house(...) from
// inside api() template strings, which only see symbols defined via api().
api(`
  function house(seed, n, startDay = 5) {
    const h = SIM_generateHouse(seed, n);
    h.clock.day = startDay;
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    return h;
  }
`);

// Run `days` real ticks over a fresh house. Optional temperament override
// (all residents), facility repair, and a forced schedule template (every
// resident becomes a day_shift worker — used to guarantee a weekday morning
// block exists so the change_clothes beat has a transition to fire on).
// Returns per-resident traces: for every tick, { block, activity, clothing,
// outfitTraitKeys, outfit } plus aggregates used by the assertions below.
function simulate({ residents = 3, days = 3, seed = 20260816, startDay = 5,
                    temper = null, template = null, repair = true }) {
  const { api: a } = loadEngine();
  a(`
    __h = SIM_generateHouse(${seed}, ${residents});
    __h.clock.day = ${startDay};
    __gs = { meta: { seed: __h.seed, clock: __h.clock, contentConfig: null, sessionLog: [] },
             player: __h.player, npcs: __h.npcs, world: __h.world, objects: __h.objects };
    ${repair ? `for (const k of Object.keys(__gs.world.upgrades)) __gs.world.upgrades[k] = { tier: 'functional', condition: 100 };` : ''}
    ${template ? `for (const id of Object.keys(__gs.npcs)) __gs.npcs[id].bible.scheduleTemplate = ${JSON.stringify(template)};` : ''}
    ${temper ? `for (const id of Object.keys(__gs.npcs)) {
      const t = __gs.npcs[id].bible.temperament || (__gs.npcs[id].bible.temperament = {});
      ${Object.entries(temper).map(([k, v]) => `t.${k} = ${v};`).join('\n      ')}
    }` : ''}
    __restock = () => {
      for (const o of Object.values(__gs.objects['room_kitchen'] || {})) {
        if (o.defId === 'fridge' || o.defId === 'pantry') {
          o.contents = addStack(o.contents || [], 'eggs', 12, null, {}, __gs.meta.clock.day);
        }
      }
    };
    __restock();
    __res = Object.entries(__gs.npcs).filter(([, n]) => n.residency.status === 'resident').map(([id]) => id);
    __wardrobeWork = {}; __wardrobeSwim = {};
    for (const id of __res) {
      const ids = npcWardrobeItems(__gs, __gs.npcs[id]);
      __wardrobeWork[id] = ids.some(i => (CLOTHING_DEFS[i].traits || []).some(t => t === 'work' || t === 'formal'));
      __wardrobeSwim[id] = ids.some(i => (CLOTHING_DEFS[i].traits || []).includes('swim'));
    }
    __trace = {}; __clothingSeen = {}; __nude = {}; __changingRuns = {}; __workTicks = {}; __swimTicks = [];
    __lastClothing = {};
    for (const id of __res) { __trace[id] = []; __clothingSeen[id] = {}; __nude[id] = []; __changingRuns[id] = 0; __workTicks[id] = { ticks: 0, clothed: 0, workItem: 0 }; __lastClothing[id] = null; }
    __fired = {};
    for (let t = 0; t < 48 * ${days}; t++) {
      __gs.meta.clock = advanceClock(__gs.meta.clock, 1);
      if (__gs.meta.clock.minutes < 30) __restock();
      const rb = resolveBatch(__gs, 1, { advanceClock: false });
      __gs = rb.state;
      for (const e of rb.events) __fired[e.type] = (__fired[e.type] || 0) + 1;
      for (const id of __res) {
        const n = __gs.npcs[id];
        const block = n.schedule && n.schedule.currentBlock;
        __clothingSeen[id][n.clothing] = true;
        if (n.clothing === 'nude') __nude[id].push(n.activity);
        if (n.clothing === 'changing') {
          __changingRuns[id] = __lastClothing[id] === 'changing' ? __changingRuns[id] + 1 : 1;
        }
        __lastClothing[id] = n.clothing;
        if (block === 'work') {
          __workTicks[id].ticks++;
          if (n.clothing === 'dressed') __workTicks[id].clothed++;
          if (Object.values(n.outfit || {}).some(i => (CLOTHING_DEFS[i] && (CLOTHING_DEFS[i].traits || []).some(x => x === 'work' || x === 'formal')))) __workTicks[id].workItem++;
        }
        if (n.activity === 'swimming laps' || n.activity === 'swimming') {
          __swimTicks.push({ id, clothing: n.clothing,
            hasSwim: Object.values(n.outfit || {}).some(i => (CLOTHING_DEFS[i] && (CLOTHING_DEFS[i].traits || []).includes('swim'))),
            wardrobeHasSwim: __wardrobeSwim[id] });
        }
      }
    }
  `);
  return {
    api: a,
    res: a('__res'),
    fired: a('__fired'),
    clothingSeen: a('__clothingSeen'),
    nudeActivities: a('__nude'),
    changingRuns: a('__changingRuns'),
    changeFires: a('__fired.change_clothes') || 0,
    workTicks: a('__workTicks'),
    wardrobeWork: a('__wardrobeWork'),
    swimTicks: a('__swimTicks'),
  };
}

// ---------------------------------------------------------------- 1
console.log('\n1. Phase 6 tables (config.js)');
check('ACTIVITY_OUTFIT_TYPES values are all real OUTFIT_TYPES keys',
      api(`Object.values(ACTIVITY_OUTFIT_TYPES).every(t => !!OUTFIT_TYPES[t])`));
check('every ACTIVITY_OUTFIT_TYPES key is a real activity string in the pools',
      api(`(() => {
        const pool = new Set(Object.values(ACTIVITY_TABLES).flatMap(a => a));
        return Object.keys(ACTIVITY_OUTFIT_TYPES).every(a => pool.has(a));
      })()`));
check('NUDITY_TUNING is sane (threshold/chance in (0,1), shower nude on, floor negative)',
      api(`NUDITY_TUNING.deviancyThreshold > 0 && NUDITY_TUNING.deviancyThreshold < 1 &&
           NUDITY_TUNING.nudeSwimChance > 0 && NUDITY_TUNING.nudeSwimChance < 1 &&
           NUDITY_TUNING.nudeShower === true && NUDITY_TUNING.workDressConscientiousnessFloor < 0`));
check('WORK_BLOCKS names only real schedule blocks',
      api(`(() => {
        const real = new Set(Object.values(SCHEDULES).flatMap(s => Object.keys(s).flatMap(d => Object.keys(s[d]))));
        const bogus = WORK_BLOCKS.filter(b => !real.has(b));
        return bogus.length === 0;
      })()`));
check('the change_clothes drive is a quiet transient beat with a transition window',
      api(`DRIVE_DEFS.change_clothes.setsClothing === 'changing' &&
           DRIVE_DEFS.change_clothes.cooldownMinutes > 0 &&
           DRIVE_DEFS.change_clothes.timeOfDay.every(b => !!BLOCK_TIME_OF_DAY[b]) &&
           DRIVE_DEFS.change_clothes.utility.temperamentWeights.conscientiousness > 0 &&
           !DRIVE_DEFS.change_clothes.effects`));
check('the swim drive wraps self.swim, overrides to swimming laps, meters the pool',
      api(`DRIVE_DEFS.swim.actionId === 'self.swim' &&
           DRIVE_DEFS.swim.activityOverride === 'swimming laps' &&
           DRIVE_DEFS.swim.meters.some(m => m[0] === 'devices') &&
           DRIVE_DEFS.swim.meters.some(m => m[0] === 'waterHeating') &&
           DRIVE_DEFS.swim.timeOfDay.every(b => !!BLOCK_TIME_OF_DAY[b])`));
check('swimming decays the pool facility through MAINTENANCE',
      api(`Array.isArray(MAINTENANCE.npcDecayActions.swim) &&
           MAINTENANCE.npcDecayActions.swim.includes('pool_systems')`));
check('PEEP_CLOTHING_DESC knows the two new states (nude + changing)',
      api(`!!PEEP_CLOTHING_DESC.nude && !!PEEP_CLOTHING_DESC.changing`));

// ---------------------------------------------------------------- 2
console.log('\n2. Pure NPC rules (npc.js)');
check('deviancy is the openness×assertiveness product, clamped, never stored',
      api(`(() => {
        const high = npcDeviancy({ bible: { temperament: { openness: 1, assertiveness: 1 } } });
        const low  = npcDeviancy({ bible: { temperament: { openness: -1, assertiveness: -1 } } });
        const mid  = npcDeviancy({ bible: { temperament: { openness: 0.5, assertiveness: 0.5 } } });
        return high === 1 && low === 0 && Math.abs(mid - 0.5625) < 1e-9 &&
               npcDeviancy({}) === 0.25; // missing temperament → (0.5*0.5)
      })()`));
check('a low-deviancy NPC NEVER swims nude on any rng draw',
      api(`(() => {
        const n = { bible: { temperament: { openness: -1, assertiveness: -1 } } };
        for (let i = 0; i < 50; i++) if (npcSwimsNude(n, () => 0.99)) return false;
        return true;
      })()`));
check('a high-deviancy NPC swims nude only when the rng beats nudeSwimChance',
      api(`(() => {
        const n = { bible: { temperament: { openness: 1, assertiveness: 1 } } };
        return npcSwimsNude(n, () => 0.1) === (NUDITY_TUNING.nudeSwimChance > 0.1) &&
               npcSwimsNude(n, () => 0.9) === false;
      })()`));
check('outfitTypeForContext: activity wins, work blocks dress for the office, lounge blocks lounge',
      api(`(() => {
        const con = { bible: { temperament: { conscientiousness: 1 } } };
        const sl  = { bible: { temperament: { conscientiousness: -1 } } };
        return outfitTypeForContext(con, 'leisure', 'swimming laps') === 'swim' &&
               outfitTypeForContext(con, 'work', null) === 'work' &&
               outfitTypeForContext(sl, 'work', null) === 'daily' &&
               outfitTypeForContext(con, 'evening', null) === 'loungewear' &&
               outfitTypeForContext(con, 'midday', null) === 'daily';
      })()`));
check('npcClothingForContext: sleep → sleepwear; transients revert; shower is nude',
      api(`(() => {
        const n = { bible: { temperament: { openness: -1, assertiveness: -1 } } };
        return npcClothingForContext(n, 'sleep', 'sleeping', 'dressed', () => 0.9) === 'sleepwear' &&
               npcClothingForContext(n, 'morning', 'watching TV', 'changing', () => 0.9) === 'dressed' &&
               npcClothingForContext(n, 'morning', 'watching TV', 'towel', () => 0.9) === 'dressed' &&
               npcClothingForContext(n, 'midday', 'showering', 'dressed', () => 0.9) === 'nude';
      })()`));
check('npcClothingForContext: the pool nudity gate is deviancy-gated and once-per-session',
      api(`(() => {
        const prudish = { bible: { temperament: { openness: -1, assertiveness: -1 } } };
        const deviant = { bible: { temperament: { openness: 1, assertiveness: 1 } } };
        // prudish never nude in the pool
        for (let i = 0; i < 20; i++) {
          if (npcClothingForContext(prudish, 'leisure', 'swimming laps', 'dressed', () => 0.05) === 'nude') return false;
        }
        // deviant CAN be nude, and once nude STAYS nude (already-nude guard)
        const once = npcClothingForContext(deviant, 'leisure', 'swimming laps', 'dressed', () => 0.05);
        if (once !== 'nude') return false;
        return npcClothingForContext(deviant, 'leisure', 'swimming laps', 'nude', () => 0.99) === 'nude';
      })()`));
check('a leftover nude with no nude activity reverts to dressed the same tick',
      api(`(() => {
        const n = { bible: { temperament: { openness: -1, assertiveness: -1 } } };
        return npcClothingForContext(n, 'leisure', 'watching TV', 'nude', () => 0.9) === 'dressed';
      })()`));

// ---------------------------------------------------------------- 3
console.log('\n3. Wardrobe → outfit composition (item pick)');
check('the three signature starter wardrobes all fit tier-1 capacity (12)',
      api(`Object.values(STARTER_WARDROBES).every(s => s.length <= 12)`));
check('bedroom_1 work outfit actually wears the work items it owns',
      api(`(() => {
        const ids = STARTER_WARDROBES.bedroom_1.map(i => i.defId);
        const out = composeOutfit('work', ids);
        return Object.values(out).some(id => (CLOTHING_DEFS[id].traits || []).some(t => t === 'work' || t === 'formal'));
      })()`));
check('bedroom_2 workout outfit wears sport items',
      api(`(() => {
        const ids = STARTER_WARDROBES.bedroom_2.map(i => i.defId);
        const out = composeOutfit('workout', ids);
        return Object.values(out).some(id => (CLOTHING_DEFS[id].traits || []).includes('sport'));
      })()`));
check('bedroom_3 swim outfit wears swim items',
      api(`(() => {
        const ids = STARTER_WARDROBES.bedroom_3.map(i => i.defId);
        const out = composeOutfit('swim', ids);
        return Object.values(out).some(id => (CLOTHING_DEFS[id].traits || []).includes('swim'));
      })()`));
check('a wardrobe with no matching items degrades gracefully to a real daily outfit',
      api(`(() => {
        const ids = ['basic_tee', 'jeans', 'socks_cotton', 'boxers'];
        const out = composeOutfit('formal', ids);
        return Object.keys(out).length > 0 && Object.values(out).every(id => !!CLOTHING_DEFS[id]);
      })()`));
check('npcWardrobeItems reads the bedroom wardrobe, and falls back to the bag when absent',
      api(`(() => {
        const h = house(20260816, 3);
        const n = Object.values(h.npcs).find(x => x.residency.status === 'resident');
        const room = n.residency.room;
        const bucket = h.objects['room_' + room];
        const w = bucket && Object.values(bucket).find(o => o.defId === 'wardrobe');
        const viaWardrobe = npcWardrobeItems(h, n);
        const okWardrobe = !!w && viaWardrobe.length > 0 && viaWardrobe.every(id => !!CLOTHING_DEFS[id]);
        // Empty-bucket fallback: a layout with no wardrobe composes from the bag.
        delete bucket[Object.keys(bucket).find(k => bucket[k].defId === 'wardrobe')];
        n.inventory = [{ defId: 'basic_tee', qty: 1 }, { defId: 'jeans', qty: 1 }];
        const viaBag = npcWardrobeItems(h, n);
        return okWardrobe && viaBag.length === 2 && viaBag.includes('basic_tee');
      })()`));
check('outfitMatchesType reads any worn item for the type’s traits, and null type always matches',
      api(`(() => {
        const workOut = { top: 'button_up', bottom: 'dress_pants' };
        const dailyOut = { top: 'basic_tee', bottom: 'jeans' };
        return outfitMatchesType(workOut, 'work') === true &&
               outfitMatchesType(dailyOut, 'work') === false &&
               outfitMatchesType(dailyOut, null) === true &&
               outfitMatchesType({}, 'daily') === false; // empty outfit is never dressed
      })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. The intimate gate stays fail-closed for every new state (invariant 4)');
check('dressed/towel/sleepwear/changing NEVER open the intimate branch, even opted in',
      api(`(() => {
        const h = house(20260816, 2);
        const npc = Object.values(h.npcs)[0];
        for (const c of ['dressed', 'towel', 'sleepwear', 'changing']) {
          npc.clothing = c;
          const d = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h });
          if (d.includes('nipples') || d.includes('genitals')) return false;
        }
        return true;
      })()`));
check('nude opens it exactly like undressed does, with mature flags on',
      api(`(() => {
        const h = house(20260816, 2);
        const npc = Object.values(h.npcs)[0];
        npc.clothing = 'nude';
        const d = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h });
        return d.includes('completely naked') && (d.includes('nipples') || d.includes('breasts'));
      })()`));

// ---------------------------------------------------------------- 5
console.log('\n5. change_clothes drive: candidacy + firing behaviour');
check('candidacy fires on a transition (yesterday’s outfit, today’s work block)',
      api(`(() => {
        const h = house(20260816, 3);
        const n = Object.values(h.npcs).find(x => x.residency.status === 'resident');
        n.bible.temperament.conscientiousness = 1;
        n.outfit = composeOutfit('daily', npcWardrobeItems(h, n)); // wore daily yesterday
        return DRIVE_CANDIDACY.change_clothes(n, 'x', h, { block: 'morning', activity: null }) === true;
      })()`));
check('candidacy refuses when already dressed for the block',
      api(`(() => {
        const h = house(20260816, 3);
        const n = Object.values(h.npcs).find(x => x.residency.status === 'resident');
        n.outfit = npcOutfitForContext(n, h, 'morning', null); // derived for this block
        return DRIVE_CANDIDACY.change_clothes(n, 'x', h, { block: 'morning', activity: null }) === false;
      })()`));
check('candidacy refuses mid-activity (someone in the pool is already dressed for it)',
      api(`(() => {
        const h = house(20260816, 3);
        const n = Object.values(h.npcs).find(x => x.residency.status === 'resident');
        n.outfit = { swimwear: 'one_piece' };
        return DRIVE_CANDIDACY.change_clothes(n, 'x', h, { block: 'leisure', activity: 'swimming laps' }) === false;
      })()`));
check('candidacy refuses an empty wardrobe',
      api(`(() => {
        const h = house(20260816, 3);
        const n = Object.values(h.npcs).find(x => x.residency.status === 'resident');
        n.bible.temperament.conscientiousness = 1;
        n.outfit = composeOutfit('daily', npcWardrobeItems(h, n));
        n.inventory = [];
        const room = n.residency.room;
        const bucket = h.objects['room_' + room];
        delete bucket[Object.keys(bucket).find(k => bucket[k].defId === 'wardrobe')];
        return DRIVE_CANDIDACY.change_clothes(n, 'x', h, { block: 'morning', activity: null }) === false;
      })()`));
check('the drive is scored by conscientiousness (fastidious above threshold, slovenly below, at a real morning minute)',
      api(`(() => {
        const ctx = { needs: {}, bible: {}, flags: {} };
        const fast = scoreDrive('change_clothes', { bible: { temperament: { conscientiousness: 1 } } },
                                { ...ctx, perceived: [], block: 'morning', minutesOfDay: 490, nowAbs: 100000 });
        const slow = scoreDrive('change_clothes', { bible: { temperament: { conscientiousness: -1 } } },
                                { ...ctx, perceived: [], block: 'morning', minutesOfDay: 490, nowAbs: 100000 });
        return fast.score >= COGNITION.actionThreshold && slow.score < COGNITION.actionThreshold;
      })()`));

// ---------------------------------------------------------------- 6
console.log('\n6. Full sim: two weekend leisure days + a workday, real resolveTick');
const natural = simulate({ seed: 20260816 });
check('every tick, every resident is in a declared clothing state',
      natural.res.every(id => Object.keys(natural.clothingSeen[id]).every(c => CLOTHING_STATES.includes(c))),
      natural.res.map(id => `${id}:${Object.keys(natural.clothingSeen[id]).join('/')}`).join(' | '));
check('sleepwear is observed in bed (sleep block)',
      natural.res.every(id => natural.clothingSeen[id].sleepwear),
      natural.res.map(id => Object.keys(natural.clothingSeen[id]).join('/')).join(' | '));
check('the work block is met with dressed clothing, never sleepwear/nude',
      natural.res.every(id => natural.workTicks[id].ticks > 0 && natural.workTicks[id].clothed === natural.workTicks[id].ticks),
      natural.res.map(id => `${id}:${JSON.stringify(natural.workTicks[id])}`).join(' | '));
check('a resident whose wardrobe has work items wears them through every work tick; a wardrobe without them degrades to non-work clothes',
      natural.res.every(id => natural.wardrobeWork[id]
        ? natural.workTicks[id].workItem === natural.workTicks[id].ticks
        : natural.workTicks[id].workItem === 0),
      natural.res.map(id => `${id}(hasWork=${natural.wardrobeWork[id]}):${JSON.stringify(natural.workTicks[id])}`).join(' | '));
check('no nude ticks for a natural (mostly non-deviant) cast',
      natural.res.every(id => natural.nudeActivities[id].length === 0),
      natural.res.map(id => `${id}:${natural.nudeActivities[id].join(',')}`).join(' | '));

const prudish = simulate({ seed: 20260817, temper: { openness: -1, assertiveness: -1 } });
check('a fully prudish cast NEVER swims nude across the whole run',
      prudish.res.every(id => prudish.nudeActivities[id].length === 0));

const deviant = simulate({ seed: 20260818, temper: { openness: 1, assertiveness: 1, conscientiousness: 1 } });
check('a fully deviant cast DOES produce nude ticks, and only during a swim activity',
      (() => {
        const anyNude = deviant.res.some(id => deviant.nudeActivities[id].length > 0);
        const onlySwim = deviant.res.every(id => deviant.nudeActivities[id].every(a => a === 'swimming laps' || a === 'swimming'));
        return anyNude && onlySwim;
      })(),
      deviant.res.map(id => `${id}:${deviant.nudeActivities[id].slice(0, 5).join(',')}`).join(' | '));
check('swim ticks carry a swim outfit whenever the wardrobe has one; otherwise they degrade gracefully',
      natural.swimTicks.every(s => !s.wardrobeHasSwim || s.hasSwim),
      natural.swimTicks.map(s => `${s.id}(hasSwim=${s.wardrobeHasSwim}):wears=${s.hasSwim}`).join(' | '));

// The drive's firing is schedule-luck-dependent on a natural cast (it needs a
// weekday morning block AND a candidate who actually scores over the bar), so
// the firing proof runs on a forced day_shift + conscientious cast: everyone
// has a Monday morning, everyone is fastidious, so the transition beat MUST
// surface through the real pipeline.
const fastidious = simulate({ seed: 20260819, template: 'day_shift', temper: { conscientiousness: 1 } });
check('the change_clothes beat fires through the real pipeline on a workday morning',
      fastidious.changeFires > 0, `change_clothes events: ${fastidious.changeFires}`);
check("'changing' never lasts more than one tick in any sim",
      Object.values(fastidious.changingRuns).every(v => v <= 1) &&
      Object.values(natural.changingRuns).every(v => v <= 1) &&
      Object.values(deviant.changingRuns).every(v => v <= 1),
      `natural ${JSON.stringify(natural.changingRuns)} | fastidious ${JSON.stringify(fastidious.changingRuns)} | deviant ${JSON.stringify(deviant.changingRuns)}`);

console.log(`
${'='.repeat(46)}
  ${pass} passed, ${fail} failed
${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
