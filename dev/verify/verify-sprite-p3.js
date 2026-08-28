// Avatars & Sprite Studio, Phase 3 — the queue, readiness, and the ambient
// tier. (src/ref/wip/avatars-and-sprite-studio-plan.md)
//
// Three things are being defended here, and only one of them is about speed:
//
//   THE BUDGET (D12/D13) — `gs.npcs` is UNBOUNDED. RoomList mints ~30 stubs a
//     day and promotes any of them to a full NPC the moment a profile is
//     opened, so a roster accumulates people the player met once. Nothing
//     below `contact` may ever be eagerly generated, at any setting, and a
//     character must cost exactly ONE generation to be ready — the avatar is
//     a crop of the cutout, which is what makes an eager pass affordable at
//     all. If the ready-set ever grows, these numbers are the alarm.
//   THE YIELD (D14) — a scene plate, a peek frame, a dream panel or an
//     outcome-window image always wins. Enforceable only because every one of
//     the sixteen root.generateImage call sites now goes through one tracked
//     wrapper.
//   THE AMBIENT TIER (D15) — scene presence has always been two tiers, and
//     the renderer only ever drew one of them. An NPC could be described by
//     the scene reader, be addressable, appear in the present list, and be
//     absent from the picture.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['sprites.js'] });

let pass = 0, fail = 0;
async function check(name, condOrPromise, detail) {
  let cond = condOrPromise;
  if (cond && typeof cond.then === 'function') cond = await cond;
  if (cond === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof cond === 'string' && cond ? cond : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

async function main() {

api(`
  var kvCalls = { get: 0, set: 0, update: 0, delete: 0, keys: 0 };
  function makeMemKv() {
    const stores = {};
    const wrap = (name) => {
      const m = {};
      const S = () => stores[name] || (stores[name] = {});
      m.get = async (k) => { kvCalls.get++; const v = S()[k]; return v === undefined ? undefined : structuredClone(v); };
      m.set = async (k, v) => { kvCalls.set++; S()[k] = structuredClone(v); };
      m.update = async (k, fn) => { kvCalls.update++; const s = S(); const cur = s[k] === undefined ? undefined : structuredClone(s[k]); const nv = fn(cur); s[k] = structuredClone(nv); return nv; };
      m.keys = async () => { kvCalls.keys++; return Object.keys(S()); };
      m.delete = async (k) => { kvCalls.delete++; delete S()[k]; };
      return m;
    };
    const kv = {};
    for (const f of ['meta','player','world','npcs','objects','images','snapshots','saves','saveIndex','menu','sprites']) kv[f] = wrap(f);
    return kv;
  }
  function blob(size) { return { size: size, __blob: true }; }

  // A cast with one of everything the tiering has to tell apart.
  function castState() {
    return {
      meta: { clock: { day: 3, phase: 'evening' } },
      player: { name: 'Sam', location: 'living_room', portrait: { seed: 7 }, clothing: 'dressed', outfit: {} },
      npcs: {
        res1:    { bible: { name: 'Marisol', genSeed: 101 }, residency: { status: 'resident' },  location: 'kitchen',     clothing: 'dressed', outfit: {} },
        res2:    { bible: { name: 'Theo',    genSeed: 102 }, residency: { status: 'resident' },  location: 'living_room', clothing: 'dressed', outfit: {} },
        present: { bible: { name: 'Nadia',   genSeed: 103 }, residency: { status: 'visitor' },   location: 'living_room', clothing: 'dressed', outfit: {} },
        contact: { bible: { name: 'Priya',   genSeed: 104 }, residency: { status: 'visitor' },   location: 'elsewhere', contactKnown: true, clothing: 'dressed', outfit: {} },
        prospect:{ bible: { name: 'Otto',    genSeed: 105 }, residency: { status: 'prospective' }, location: 'elsewhere', clothing: 'dressed', outfit: {} },
        stranger:{ bible: { name: 'Zed',     genSeed: 106 }, residency: { status: 'former' },    location: 'elsewhere', clothing: 'dressed', outfit: {} },
      },
      objects: {},
    };
  }

  async function freshQueue(mode) {
    root.kv = makeMemKv();
    clearSpriteSession();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS } });
    await loadSpriteIndex(true);
    settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
    if (mode) settingsCache.characterArt = mode;
    spriteQueue.pending = []; spriteQueue.running = false;
    spriteQueue.spentSession = 0; spriteQueue.spentDay = 0; spriteQueue.day = null;
    spriteQueue.lastTouch = 0; spriteQueue.lastError = null;
  }
  function tierNames(gs) {
    const out = {};
    for (const [id, npc] of Object.entries(gs.npcs)) out[id] = spriteTierOf(gs, id, npc);
    return out;
  }
`);

console.log('\n1. Tiering (D12) — being interesting is what earns art');

await check('each tier is recognised by the condition the rest of the game already uses',
  api(`(() => {
    const gs = castState();
    const t = tierNames(gs);
    const want = { res1: 'resident', res2: 'resident', present: 'present', contact: 'contact', prospect: 'contact', stranger: null };
    for (const k of Object.keys(want)) if (t[k] !== want[k]) return k + ' = ' + t[k] + ', expected ' + want[k];
    return true;
  })()`));

await check('a resident in another room is STILL a resident — the household does not stop mattering when it leaves the room',
  api(`(() => {
    const gs = castState();
    return spriteTierOf(gs, 'res1', gs.npcs.res1) === 'resident' || 'a resident elsewhere lost its tier';
  })()`));

await check('a stranger is NEVER queued, at ANY setting — the unbounded-roster guard',
  api(`(async () => {
    for (const mode of ['household', 'known']) {
      await freshQueue(mode);
      const gs = castState();
      spriteQueueRefill(gs);
      const zed = avatarIdentityFor(gs.npcs.stranger, false);
      if (spriteQueue.pending.some((i) => i.identity === zed)) return 'a stranger was queued at ' + mode;
    }
    return true;
  })()`));

console.log('\n2. The setting is a real ceiling, and Off is a hard gate');

await check('household queues the player and residents only',
  api(`(async () => {
    await freshQueue('household');
    const gs = castState();
    spriteQueueRefill(gs);
    const tiers = [...new Set(spriteQueue.pending.map((i) => i.tier))].sort();
    if (JSON.stringify(tiers) !== JSON.stringify(['player', 'resident'])) return 'queued tiers: ' + JSON.stringify(tiers);
    return true;
  })()`));

await check('"everyone I know" reaches down to contact, and no further',
  api(`(async () => {
    await freshQueue('known');
    const gs = castState();
    spriteQueueRefill(gs);
    const tiers = [...new Set(spriteQueue.pending.map((i) => i.tier))].sort();
    if (JSON.stringify(tiers) !== JSON.stringify(['contact', 'player', 'present', 'resident'])) return 'queued tiers: ' + JSON.stringify(tiers);
    return true;
  })()`));

await check('OFF means off: nothing queued, the queue refuses to run, and scenes lose their cast entirely',
  api(`(async () => {
    await freshQueue('off');
    const gs = castState();
    if (characterArtEnabled() !== false) return 'characterArtEnabled() is still true';
    if (spriteQueueRefill(gs).length !== 0) return 'off still queued ' + spriteQueue.pending.length + ' item(s)';
    if (spriteQueueBlockedReason(gs, 1e9) !== 'setting-off') return 'blocked reason was ' + spriteQueueBlockedReason(gs, 1e9);
    // ...and the scene renders plate-only, not "cast with missing art".
    const overlay = layoutSceneCutouts(gs, { active: ['res1'], ambient: ['present'] }, 'plate_x');
    if (overlay.length !== 0) return 'off still laid out ' + overlay.length + ' cutout(s)';
    return true;
  })()`));

await check('the queue is sorted by tier, so the household is drawn before anyone else',
  api(`(async () => {
    await freshQueue('known');
    const gs = castState();
    spriteQueueRefill(gs);
    const ranks = spriteQueue.pending.map((i) => i.rank);
    for (let i = 1; i < ranks.length; i++) if (ranks[i] < ranks[i - 1]) return 'out of order: ' + JSON.stringify(ranks);
    return spriteQueue.pending[0].tier === 'player' || 'first item was ' + spriteQueue.pending[0].tier;
  })()`));

console.log('\n3. One cutout buys both assets (D13) — what makes an eager pass affordable');

await check('a character is READY after exactly one generation, not two',
  api(`(async () => {
    await freshQueue('household');
    const gs = castState();
    spriteQueueRefill(gs);
    const perCharacter = {};
    for (const item of spriteQueue.pending) perCharacter[item.identity] = (perCharacter[item.identity] || 0) + 1;
    const bad = Object.entries(perCharacter).filter(([, n]) => n !== 1);
    if (bad.length) return 'these characters need more than one generation: ' + JSON.stringify(bad);
    if (SPRITE_QUEUE.readySet.length !== 1) return 'readySet grew to ' + SPRITE_QUEUE.readySet.length + ' — re-read D13, the budget assumes one';
    return true;
  })()`));

await check('the queue never enqueues an AVATAR — it is derived, never generated',
  api(`(async () => {
    await freshQueue('known');
    spriteQueueRefill(castState());
    return !spriteQueue.pending.some((i) => i.variant === SPRITE_AVATAR_VARIANT) || 'an avatar was queued';
  })()`));

await check("the ready-set follows the character's CURRENT outfit, not a fixed one",
  api(`(() => {
    const dressed = spriteReadySetFor({ clothing: 'dressed', outfit: { top: 'tee', bottom: 'jeans' } });
    const towel   = spriteReadySetFor({ clothing: 'towel', outfit: {} });
    return dressed[0] !== towel[0] || 'a clothing change did not change the wanted variant';
  })()`));

await check('a character who already HAS an override is not queued again',
  api(`(async () => {
    await freshQueue('household');
    const gs = castState();
    const identity = avatarIdentityFor(gs.npcs.res1, false);
    const variant = spriteReadySetFor(gs.npcs.res1)[0];
    await putSpriteRecord({ slot: spriteSlotId(identity, 'cutout', variant), origin: 'edited', mode: 'pinned', image: blob(10), master: blob(10) });
    spriteQueueRefill(gs);
    return !spriteQueue.pending.some((i) => i.identity === identity) || 'a character with custom art was queued anyway';
  })()`));

console.log('\n4. The yield (D14) — the player always wins');

await check('every reason to stand down is enumerable, and each one actually fires',
  api(`(async () => {
    await freshQueue('household');
    const gs = castState();
    if (spriteQueueBlockedReason(null, 1e9) !== 'no-state') return 'no-state';
    spriteQueue.lastTouch = 1e9;
    if (spriteQueueBlockedReason(gs, 1e9) !== 'not-idle') return 'not-idle did not fire';
    spriteQueue.lastTouch = 0;
    spriteQueue.running = true;
    if (spriteQueueBlockedReason(gs, 1e9) !== 'already-running') return 'single-flight did not fire';
    spriteQueue.running = false;
    if (spriteQueueBlockedReason(gs, 1e9) !== null) return 'still blocked: ' + spriteQueueBlockedReason(gs, 1e9);
    return true;
  })()`));

await check('a FOREGROUND generation blocks the queue — the D14 promise, through the tracked wrapper',
  api(`(async () => {
    await freshQueue('household');
    const gs = castState();
    spriteQueue.lastTouch = 0;
    if (spriteQueueBlockedReason(gs, 1e9) !== null) return 'setup: expected unblocked';
    // A scene plate starts generating and does not finish yet.
    let release;
    root.generateImage = () => new Promise((r) => { release = () => r({}); });
    const inflight = getScenePlate('living_room', 'evening', {});
    await Promise.resolve(); await Promise.resolve();
    if (!imageBusy()) return 'the tracked wrapper did not notice a foreground generation';
    if (spriteQueueBlockedReason(gs, 1e9) !== 'foreground-busy') return 'the queue did not yield to it';
    const ran = await spriteQueueStep(gs, 1e9);
    if (ran !== false) return 'the queue ran a step while the foreground was busy';
    release(); await inflight;
    if (imageBusy()) return 'the counter did not unwind';
    if (spriteQueueBlockedReason(gs, 1e9) !== null) return 'still blocked after the foreground finished';
    return true;
  })()`));

await check('the in-flight counter unwinds even when a generation THROWS',
  api(`(async () => {
    root.generateImage = async () => { throw new Error('boom'); };
    await getScenePlate('kitchen', 'day', {});
    return imageBusy() === false || 'a thrown generation left the counter stuck, permanently starving the queue';
  })()`));

await check('a budget stops the queue, and the day rollover restores it',
  api(`(async () => {
    await freshQueue('household');
    const gs = castState();
    spriteQueue.lastTouch = 0;
    // Prime the day first: the counter initialises lazily on the first budget
    // check of a session (a fresh session gets a fresh day's budget), so
    // setting spentDay before that check would be wiped by it.
    spriteQueueBudgetLeft(gs);
    if (spriteQueue.day !== 3) return 'the day was not adopted: ' + spriteQueue.day;
    spriteQueue.spentDay = SPRITE_QUEUE.maxPerDay;
    if (spriteQueueBlockedReason(gs, 1e9) !== 'budget') return 'the day budget did not stop it';
    gs.meta.clock.day = 4;
    if (spriteQueueBlockedReason(gs, 1e9) !== null) return 'a new day did not restore the budget';
    if (spriteQueue.spentDay !== 0) return 'the day counter did not reset';
    spriteQueue.spentSession = SPRITE_QUEUE.maxPerSession;
    return spriteQueueBlockedReason(gs, 1e9) === 'budget' || 'the session budget did not stop it';
  })()`));

await check('a step spends budget on success and NOT on failure',
  api(`(async () => {
    await freshQueue('household');
    const gs = castState();
    spriteQueue.lastTouch = 0;
    spriteQueueRefill(gs);
    // The harness has no canvas, so cleanCutout throws and the getter returns
    // {url:null} — the failure path, exactly as D12 degrades.
    root.generateImage = async () => ({});
    const before = spriteQueue.spentDay;
    await spriteQueueStep(gs, 1e9);
    if (spriteQueue.spentDay !== before) return 'a failed generation spent budget';
    if (!spriteQueue.lastError) return 'a failed generation was not recorded';
    if (spriteQueue.running) return 'the single-flight flag was left set after a failure';
    return true;
  })()`));

console.log('\n5. The ambient tier (D15) — everyone in the room is in the picture');

await check('ambient characters are laid out, not dropped',
  api(`(() => {
    settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
    const gs = castState();
    const overlay = layoutSceneCutouts(gs, { active: ['res1'], ambient: ['present', 'res2'] }, 'plate_x');
    const ids = overlay.map((p) => p.charId).sort();
    if (JSON.stringify(ids) !== JSON.stringify(['player', 'present', 'res1', 'res2'])) return 'laid out: ' + JSON.stringify(ids);
    return true;
  })()`));

await check('...smaller, and behind every active one, with the player still on top',
  api(`(() => {
    const gs = castState();
    const overlay = layoutSceneCutouts(gs, { active: ['res1'], ambient: ['present'] }, 'plate_x');
    const amb = overlay.find((p) => p.charId === 'present');
    const act = overlay.find((p) => p.charId === 'res1');
    const you = overlay.find((p) => p.isPlayer);
    if (!amb.ambient || act.ambient) return 'the ambient flag is wrong';
    if (!(amb.scale < act.scale)) return 'ambient scale ' + amb.scale + ' is not smaller than active ' + act.scale;
    if (!(amb.z < act.z)) return 'ambient z ' + amb.z + ' is not behind active ' + act.z;
    if (!(you.z > act.z)) return 'the player is no longer on top';
    return true;
  })()`));

await check('the z BANDS never overlap, so a promote/demote can never reorder the foreground',
  api(`(() => {
    const gs = castState();
    const overlay = layoutSceneCutouts(gs, { active: ['res1', 'res2'], ambient: ['present', 'contact'] }, 'plate_x');
    const ambZ = overlay.filter((p) => p.ambient).map((p) => p.z);
    const actZ = overlay.filter((p) => !p.ambient && !p.isPlayer).map((p) => p.z);
    return Math.max(...ambZ) < Math.min(...actZ) || 'ambient ' + JSON.stringify(ambZ) + ' overlaps active ' + JSON.stringify(actZ);
  })()`));

await check('an NPC listed in BOTH tiers is drawn once, as active',
  api(`(() => {
    const gs = castState();
    const overlay = layoutSceneCutouts(gs, { active: ['res1'], ambient: ['res1'] }, 'plate_x');
    const mine = overlay.filter((p) => p.charId === 'res1');
    if (mine.length !== 1) return 'drawn ' + mine.length + ' times';
    return mine[0].ambient === false || 'the duplicate won and it was drawn as ambient';
  })()`));

await check('layout stays deterministic — the same scene lays out the same way every visit (D10)',
  api(`(() => {
    const gs = castState();
    const a = JSON.stringify(layoutSceneCutouts(gs, { active: ['res1'], ambient: ['present'] }, 'plate_x'));
    const b = JSON.stringify(layoutSceneCutouts(gs, { active: ['res1'], ambient: ['present'] }, 'plate_x'));
    if (a !== b) return 'two identical calls disagreed';
    const c = JSON.stringify(layoutSceneCutouts(gs, { active: ['res1'], ambient: [] }, 'plate_x'));
    return a !== c || 'adding an ambient character changed nothing';
  })()`));

await check('promoting an ambient NPC keeps the same SLOT ID, so the layer is rescaled rather than refetched',
  api(`(() => {
    const gs = castState();
    const before = layoutSceneCutouts(gs, { active: [], ambient: ['res1'] }, 'plate_x').find((p) => p.charId === 'res1');
    const after  = layoutSceneCutouts(gs, { active: ['res1'], ambient: [] }, 'plate_x').find((p) => p.charId === 'res1');
    const idOf = (p) => spriteSlotId(cutoutIdentityToken(gs.npcs.res1, false), 'cutout', cutoutVariant(p.pose, p.expression, cutoutOutfitToken(gs.npcs.res1)));
    if (idOf(before) !== idOf(after)) return 'the slot id changed on promote — the layer would be dropped and re-requested';
    return before.ambient !== after.ambient || 'the tier did not actually change';
  })()`));

console.log('\n6. Readiness (D12) — what the roster screen renders');

await check('readiness reports custom art, and marks a queued character queued',
  api(`(async () => {
    await freshQueue('household');
    const gs = castState();
    const npc = gs.npcs.res1;
    const identity = avatarIdentityFor(npc, false);
    spriteQueueRefill(gs);
    const queued = spriteReadiness(gs, identity, npc, false);
    if (queued.state !== 'queued') return 'an enqueued character reads as ' + queued.state;
    if (queued.tier !== 'resident') return 'tier reads as ' + queued.tier;

    await putSpriteRecord({ slot: spriteSlotId(identity, 'cutout', spriteReadySetFor(npc)[0]), origin: 'edited', mode: 'pinned', image: blob(10), master: blob(10) });
    spriteQueueRefill(gs);
    const custom = spriteReadiness(gs, identity, npc, false);
    if (custom.state !== 'custom') return 'a character with an override reads as ' + custom.state;
    if (custom.customCutouts !== 1) return 'counted ' + custom.customCutouts + ' custom cutouts';
    return true;
  })()`));

await check('a broken record surfaces on the roster rather than hiding',
  api(`(async () => {
    await freshQueue('household');
    const gs = castState();
    const npc = gs.npcs.res2;
    const identity = avatarIdentityFor(npc, false);
    const slot = spriteSlotId(identity, 'cutout', spriteReadySetFor(npc)[0]);
    await putSpriteRecord({ slot, origin: 'uploaded', mode: 'pinned', image: blob(10), master: blob(10) });
    await root.kv.sprites.delete(slot);
    clearSpriteSession(); await loadSpriteIndex(true);
    await resolveSprite(identity, 'cutout', spriteReadySetFor(npc)[0], { styleToken: '' });
    const r = spriteReadiness(gs, identity, npc, false);
    return r.state === 'broken' || 'a broken record reads as ' + r.state;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
