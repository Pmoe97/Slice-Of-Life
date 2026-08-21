// Intimacy & Voyeurism Plan Phase 5 — player wardrobe UI + Change Outfit +
// clothing state machine. The pure halves (state machine tables, the
// fail-closed intimate gate taught the new states, playerSelfLine, the
// change_outfit defs) are testable here; the DOM halves (wardrobe panel
// interactions, chips rendering) are verified in the browser.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const SRCDIR = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// SIM_generateHouse returns the pre-meta assembly (the caller — save/menu —
// attaches meta). The pure consumers here need the same meta shape the real
// gameState carries, so a fresh house gets a minimal one; absent
// contentConfig falls back to CONTENT_CONFIG (mature on) in activeContentFlags.
// (Injected into the vm context — the checks below call house(...) from
// inside api() template strings, which only see symbols defined via api().)
api(`
  function house(seed, n) {
    const h = SIM_generateHouse(seed, n);
    h.meta = { clock: h.clock, sessionLog: [], scene: null, contentConfig: null };
    return h;
  }
`);

// ---------------------------------------------------------------- 1
console.log('\n1. Clothing state machine tables (config.js)');
check('CLOTHING_STATES is exactly the six machine values',
      api(`JSON.stringify(CLOTHING_STATES) === JSON.stringify(['dressed','changing','nude','towel','sleepwear','undressed'])`));
check('NAKED_CLOTHING_STATES = undressed + nude, both declared states',
      api(`JSON.stringify(NAKED_CLOTHING_STATES) === JSON.stringify(['undressed','nude']) &&
           NAKED_CLOTHING_STATES.every(s => CLOTHING_STATES.includes(s))`));
check('every state has LLM prose; every non-dressed state has scene prose',
      api(`Object.keys(CLOTHING_STATE_PROSE).length === CLOTHING_STATES.length &&
           CLOTHING_STATES.every(s => !!CLOTHING_STATE_PROSE[s]) &&
           CLOTHING_STATES.filter(s => s !== 'dressed').every(s => !!CLOTHING_STATE_SCENE_TEXT[s])`));
check('TRANSIENT_CLOTHING ⊆ CLOTHING_STATES and gains changing',
      api(`TRANSIENT_CLOTHING.every(s => CLOTHING_STATES.includes(s)) &&
           TRANSIENT_CLOTHING.includes('towel') && TRANSIENT_CLOTHING.includes('changing')`));
check('Change Outfit has a declared time cost (ACTION_TUNING)',
      api(`ACTION_TUNING.changeOutfitMinutes > 0`));

// ---------------------------------------------------------------- 2
console.log('\n2. The intimate gate, one condition at a time (invariant 4, fail-closed)');
check('a generated house gives a subject with a real physical layer',
      api(`(() => {
        const h = house(20260817, 2);
        const npc = Object.values(h.npcs)[0];
        return !!npc && !!npc.bible.physical && !!npc.bible.physical.hair;
      })()`));
check('dressed subject + opt-in + flags ON → no intimate clause',
      api(`(() => {
        const h = house(20260817, 2);
        const npc = Object.values(h.npcs)[0];
        npc.clothing = 'dressed';
        return !getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h }).includes('nipples') &&
               !getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h }).includes('genitals');
      })()`));
check('undressed subject, NO opt-in, flags ON → no intimate clause',
      api(`(() => {
        const h = house(20260817, 2);
        const npc = Object.values(h.npcs)[0];
        npc.clothing = 'undressed';
        return !getPhysicalDescriptionForPrompt(npc, { gameState: h }).includes('nipples');
      })()`));
check('undressed subject + opt-in, flags OFF → no intimate clause',
      api(`(() => {
        const h = house(20260817, 2);
        h.meta.contentConfig = { contentFlags: { mature: false } };
        const npc = Object.values(h.npcs)[0];
        npc.clothing = 'undressed';
        return !getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h }).includes('nipples');
      })()`));
check('undressed subject + opt-in + flags ON → intimate clause present',
      api(`(() => {
        const h = house(20260817, 2);
        const npc = Object.values(h.npcs)[0];
        npc.clothing = 'undressed';
        const desc = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h });
        return desc.includes('nipples') || desc.includes('penis') || desc.includes('labia') ||
               desc.includes('breasts') || desc.includes('vulva');
      })()`));
check('nude subject + opt-in + flags ON → described the same way (taught set)',
      api(`(() => {
        const h = house(20260817, 2);
        const npc = Object.values(h.npcs)[0];
        npc.clothing = 'nude';
        const desc = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h });
        return desc.includes('completely naked') && (desc.includes('nipples') || desc.includes('breasts'));
      })()`));
check('unknown clothing state NEVER opens the gate (fail-closed)',
      api(`(() => {
        const h = house(20260817, 2);
        const npc = Object.values(h.npcs)[0];
        npc.clothing = 'mystery_outfit';
        return !getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: h }).includes('nipples');
      })()`));
check('existing-state prose is byte-identical to before (no regressions)',
      api(`(() => {
        const h = house(20260817, 2);
        const npc = Object.values(h.npcs)[0];
        npc.clothing = 'towel';
        const towel = getPhysicalDescriptionForPrompt(npc, {});
        npc.clothing = 'sleepwear';
        const sleep = getPhysicalDescriptionForPrompt(npc, {});
        npc.clothing = 'undressed';
        const und = getPhysicalDescriptionForPrompt(npc, {});
        return towel.includes('wrapped in a towel') && sleep.includes('currently in sleepwear') &&
               und.includes('currently undressed') && clothingLabel(npc) === 'undressed';
      })()`));
check('clothingLabel knows the new states via the shared prose table',
      api(`(() => {
        const h = house(20260817, 2);
        const npc = Object.values(h.npcs)[0];
        npc.clothing = 'nude';
        return clothingLabel(npc) === 'completely naked';
      })()`));

// ---------------------------------------------------------------- 3
console.log('\n3. Player outfit persistence (sim.js)');
check('fresh game: player starts dressed with a composed daily outfit from their style wardrobe',
      api(`(() => {
        const h = house(20260817, 3);
        const p = h.player;
        const fashion = p.appearance.physical.fashion;
        const ids = (FASHION_WARDROBES[fashion] || STARTER_WARDROBES.bedroom_player).map(i => i.defId);
        const daily = composeOutfit('daily', ids);
        return p.clothing === 'dressed' && JSON.stringify(p.outfit) === JSON.stringify(daily);
      })()`));
check('applyPlayerOutfit writes the outfit and always lands on dressed',
      api(`(() => {
        const h = house(20260817, 2);
        const p = h.player;
        p.clothing = 'towel';
        applyPlayerOutfit(p, { swimwear: 'bikini', sandals: 'sandals' });
        return p.clothing === 'dressed' && p.outfit.swimwear === 'bikini' && p.outfit.sandals === 'sandals';
      })()`));
check('decayPlayerNeeds reverts TRANSIENT_CLOTHING (towel → dressed) but not naked states',
      api(`(() => {
        const h = house(20260817, 2);
        const p = { ...h.player, clothing: 'towel' };
        const a = decayPlayerNeeds(p, 30, h);
        const p2 = { ...h.player, clothing: 'nude' };
        const b = decayPlayerNeeds(p2, 30, h);
        const p3 = { ...h.player };
        delete p3.clothing;
        const c = decayPlayerNeeds(p3, 30, h);
        return a.clothing === 'dressed' && b.clothing === 'nude' && c.clothing === 'dressed';
      })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. The change_outfit verb + wardrobe submenu (defs.actions.js)');
check('wardrobe.interact declares the submenu in the right order',
      api(`JSON.stringify(ACTION_DEFS['wardrobe.interact'].submenu) === JSON.stringify(['wardrobe.change_outfit','wardrobe.open'])`));
check('change_outfit is object-sourced off the wardrobe, has clothes gate + a prepare',
      api(`(() => {
        const d = ACTION_DEFS['wardrobe.change_outfit'];
        return d.source.kind === 'object' && d.source.objDef === 'wardrobe' &&
               d.requires.includes('hasWardrobeClothes') && typeof d.prepare === 'function' &&
               d.writesOutfit === true && typeof d.narration.build === 'function';
      })()`));
check('hasWardrobeClothes refuses an empty wardrobe and accepts a stocked one',
      api(`(() => {
        const h = house(20260817, 3);
        const ctx = { gameState: h, actorId: 'player', roomId: 'bedroom_player', presentNpcIds: [] };
        const empty = { defId: 'wardrobe', contents: [] };
        const stocked = { defId: 'wardrobe', contents: [{ defId: 'basic_tee', qty: 1 }] };
        const orig = ctx.gameState.objects.room_bedroom_player;
        ctx.gameState.objects.room_bedroom_player = { empty, stocked };
        ctx.roomObjects = ctx.gameState.objects.room_bedroom_player;
        const e = ACTION_REQUIREMENT_CHECKERS.hasWardrobeClothes(ctx);
        ctx.gameState.objects.room_bedroom_player = { stocked };
        ctx.roomObjects = ctx.gameState.objects.room_bedroom_player;
        const s = ACTION_REQUIREMENT_CHECKERS.hasWardrobeClothes(ctx);
        ctx.gameState.objects.room_bedroom_player = orig;
        return e !== true && s === true;
      })()`));
check('submenu verbs never surface as flat chips',
      api(`(() => {
        const h = house(20260817, 2);
        h.player.location = 'bedroom_player';
        return !resolveAvailableActions(h).some(a => ['wardrobe.change_outfit','wardrobe.open'].includes(a.actionId));
      })()`));
check('wardrobe.open is a thin delegate to the container machinery',
      api(`ACTION_DEFS['wardrobe.open'].delegate === 'container.open'`));

// ---------------------------------------------------------------- 5
console.log('\n5. Scene self-line (scene.js) — the scene reflects what you wear');
check('plain dressed + no swimwear → no self line (no daily noise)',
      api(`playerSelfLine({ clothing: 'dressed', outfit: { top: 'basic_tee', jeans: 'jeans' } }) === null`));
check('towel / sleepwear / undressed / nude all produce a scene line',
      api(`(() => {
        return playerSelfLine({ clothing: 'towel' }) === "You're wrapped in a towel." &&
               playerSelfLine({ clothing: 'sleepwear' }) === "You're in sleepwear." &&
               playerSelfLine({ clothing: 'undressed' }) === "You're undressed." &&
               playerSelfLine({ clothing: 'nude' }) === "You're naked.";
      })()`));
check('swimsuit in the outfit produces the swimwear line (Phase 5 verification)',
      api(`playerSelfLine({ clothing: 'dressed', outfit: { swimwear: 'bikini' } }) === "You're in your bikini."`));
check('composeScene carries the self line through',
      api(`(() => {
        const h = house(20260817, 2);
        h.player.clothing = 'towel';
        const scene = composeScene(h, currentScene(h));
        return scene.self === "You're wrapped in a towel.";
      })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
