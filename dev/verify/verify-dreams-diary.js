// Dream Engine Phase 8 — the Dream Diary app.
// (src/ref/complete/dream-engine-plan.md)
//
// Written AFTER the fact. Phase 8 shipped live-verified only, because that
// session had no shell tool and could not run the Node suite — which left the
// diary as the one phase of the nine with no automated coverage at all. This
// closes that gap. It found two real defects on its first run, both recorded
// as assertions below.
//
// What this can and cannot reach. `render.computer.js` is a UI-layer file and
// sits BELOW the loader's ORDER cut (it needs a DOM at load), so the two
// renderers are not callable here. That is the same position ui.js was in for
// Phase 7, and it gets the same treatment: everything reachable is asserted
// against the live objects, and the renderer itself is asserted against its
// SOURCE. A source scan is weaker than a call, and it is much stronger than
// nothing — the defects it is aimed at (reading a field that does not exist,
// revealing something the player is not allowed to know) are exactly the kind
// a live click-through will not notice.
//
// The assertions aim at four things:
//
//   THE DEF (D18)     — one APP_DEFS entry serving BOTH surfaces, so the phone
//                       and the computer cannot drift apart. Two screens, a
//                       gallery and a detail, and an icon to reach it by.
//   THE RECORD        — every field the renderer reads is a field
//                       fileDreamToDiary actually writes. This is the cross-
//                       check that a source scan is uniquely good at, and it
//                       is how the `dream.kind === 'nap'` bug was found: the
//                       renderer tested the D8 CLASS for nap-ness, which is
//                       carried by `forSleep`, so a nap dream was never once
//                       labelled as one.
//   THE ECONOMY       — the diary must never tell the player which CLASS a
//   (D2/D7)             dream was. D7 lets a true dream replay something real
//                       the player never witnessed, and that is only safe
//                       because D2 makes a dream deniable. A diary that
//                       stamped an entry "true" would convert every one of
//                       them from a suspicion into a fact and hand the player
//                       an oracle. Nothing about this is visible on screen —
//                       which is precisely why it needs a test.
//   THE PIXELS (D14)  — a diary entry repaints from its own frozen prompt and
//                       seed through image.js's cached getter, never by
//                       reaching for the plugin and never from a stored blob.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({ required: ['dreams.js', 'defs.dreams.js', 'defs.computer.js', 'icons.js', 'defs.settings.js', 'settings.js', 'state.js', 'sim.js', 'config.js'] });

const RC = fs.readFileSync(path.join(SRC, 'render.computer.js'), 'utf8');

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  const c = await cond;
  if (c === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof c === 'string' && c ? c : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

// The body of one function in render.computer.js, by name. There are two
// copies of every shared renderer in that file (the desktop declaration and
// the mobile one — the codex/bank/bills precedent, later wins by hoisting), so
// this returns EVERY copy and the assertions check all of them. A fix applied
// to one copy and not the other is the failure mode that shape invites.
function bodies(name) {
  const out = [];
  let from = 0;
  for (;;) {
    const i = RC.indexOf(`function ${name}(`, from);
    if (i < 0) break;
    let depth = 0, started = false, j = i;
    for (; j < RC.length; j++) {
      if (RC[j] === '{') { depth++; started = true; }
      else if (RC[j] === '}') { depth--; if (started && depth === 0) { j++; break; } }
    }
    out.push(RC.slice(i, j));
    from = j;
  }
  return out;
}

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
      m.entries = async () => Object.entries(stores[name] || {}).map(([k, v]) => [k, structuredClone(v)]);
      m.values = async () => Object.values(stores[name] || {}).map(v => structuredClone(v));
      m.getMany = async (ks) => Promise.all(ks.map(k => m.get(k)));
      m.setMany = async (pairs) => { for (const [k, v] of pairs) await m.set(k, v); };
      m.deleteMany = async (ks) => { for (const k of ks) await m.delete(k); };
      return m;
    };
    const kv = {};
    for (const f of ['meta', 'player', 'world', 'npcs', 'objects', 'images', 'snapshots', 'saves', 'saveIndex', 'menu', 'pendingOp', 'kv']) kv[f] = wrap(f);
    return kv;
  }

  function house(seed, n) {
    const partials = [];
    for (let i = 0; i < (n || 3); i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n || 3, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      h.npcs[id].flags = {};
      h.npcs[id].location = h.npcs[id].residency.room;
      h.npcs[id].needs = h.npcs[id].needs || {};
    }
    h.player.flags = {};
    h.player.inventory = h.player.inventory || [];
    h.player.moodEvents = [];
    h.player.meta = h.player.meta || {};
    h.world.dreams = h.world.dreams || defaultDreamState();
    return h;
  }

  // A REAL filed diary entry: compiled, written, marked shown and pushed
  // through fileDreamToDiary — the same path the game uses, so the record the
  // assertions read is the record the renderer will actually be handed.
  function filed(gs, index, forSleep) {
    const d = compileDream(gs, { index: index || 1, forSleep: forSleep || 'night' });
    applyDreamPanelText(d, buildDreamFallback(d, gs));
    d.status = 'rendered';
    gs.world.dreams.queue.push(d);
    fileDreamToDiary(gs, d);
    return d;
  }
`);

async function main() {

console.log('\n1. the def — ONE entry, both surfaces (D18)');

await check('APP_DEFS.dreams serves the computer AND the phone from one def',
  api(`(() => {
    const app = APP_DEFS.dreams;
    if (!app) return 'there is no dreams app';
    // D18: render.phone.js derives the phone home grid from this field and
    // routes through the same COMPUTER_RENDERERS. Two defs would be two
    // surfaces that drift.
    if (!Array.isArray(app.devices)) return 'the dreams app declares no devices, so it is computer-only by default';
    if (!app.devices.includes('computer') || !app.devices.includes('phone')) return 'devices is ' + JSON.stringify(app.devices);
    if (app.entryScreen !== 'diary') return 'entryScreen is ' + app.entryScreen;
    if (!app.screens || !app.screens.diary || !app.screens.entry) return 'the app is missing the gallery or the detail screen';
    if (app.screens.diary.renderer !== 'dreamdiary') return 'the gallery names renderer ' + app.screens.diary.renderer;
    if (app.screens.entry.renderer !== 'dreamentry') return 'the detail names renderer ' + app.screens.entry.renderer;
    // The detail is reached by pressing a row, never from the nav rail.
    if (!app.screens.entry.hideFromNav) return 'the detail screen is offered as a nav destination';
    return true;
  })()`));

await check('the app has an icon to be reached by',
  api(`(() => {
    if (typeof ICONS !== 'object' || !ICONS) return 'ICONS is not loaded';
    if (!ICONS.dreams) return 'there is no dreams icon, so the app has no tile on either home screen';
    return true;
  })()`));

await check('both renderers are registered, and both are declared once per surface',
  (() => {
    if (!/'dreamdiary':\s*renderDreamDiary/.test(RC)) return 'dreamdiary is not in COMPUTER_RENDERERS';
    if (!/'dreamentry':\s*renderDreamEntry/.test(RC)) return 'dreamentry is not in COMPUTER_RENDERERS';
    for (const n of ['renderDreamDiary', 'renderDreamEntry', 'loadDreamPanelIntoImg', 'dreamEntryParams', 'dreamLabel', 'dreamEmptyState']) {
      const found = bodies(n).length;
      // Two is the file's own convention for a shared renderer (codex, bank,
      // bills and invest all do it). One would mean a surface lost its copy.
      if (found !== 2) return n + ' is declared ' + found + ' time(s); this file declares shared renderers twice, once per surface';
    }
    return true;
  })());

await check('pressing a diary row has a dispatch case to land in',
  (() => {
    // The shared-app dispatch lives in ui.js's handleAction switch, beside
    // codex.matchmake — not in the per-shell ui.computer.js / ui.phone.js
    // files, because one case serves both surfaces exactly as the def does.
    const ui = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
    if (!/dreams\.open-entry/.test(RC)) return 'no row emits dreams.open-entry';
    if (!/case 'dreams\.open-entry':/.test(ui)) return 'dreams.open-entry is emitted but nothing handles it — the rows would be dead';
    if (!/function doDreamOpenEntry/.test(ui)) return 'the dispatch case names a handler that does not exist';
    // The row carries the dream id and the shell that owns it; a handler that
    // ignored either would open the wrong entry, or open it on the wrong
    // device.
    const body = ui.slice(ui.indexOf('function doDreamOpenEntry'), ui.indexOf('function doDreamOpenEntry') + 1200);
    if (!/rowId|dreamId/.test(body)) return 'doDreamOpenEntry ignores which row was pressed';
    return true;
  })());

console.log('\n2. the record — the renderer reads what the filer writes');

await check('every dream field the renderers read is present on a really-filed diary entry',
  api(`(() => {
    const gs = house('diary-1');
    gs.meta.clock.day = 5;
    const night = filed(gs, 1, 'night');
    const entry = gs.world.dreams.diary[0];
    if (!entry || entry.id !== night.id) return 'the dream did not reach the diary';
    // The exact reads in renderDreamDiary / renderDreamEntry.
    for (const f of ['id', 'slots', 'panels', 'kind', 'forSleep', 'shownDay', 'compiledDay']) {
      if (entry[f] === undefined) return 'a filed record carries no ' + f + ', which the renderer reads';
    }
    if (!entry.slots.form || !DREAM_FORMS[entry.slots.form]) return 'slots.form does not resolve to a form';
    if (!entry.slots.register || !DREAM_REGISTERS[entry.slots.register]) return 'slots.register does not resolve to a register';
    if (!Array.isArray(entry.panels) || entry.panels.length === 0) return 'the entry has no panels to show';
    for (const p of entry.panels) {
      if (!p.prompt) return 'a panel has no frozen prompt to repaint from (D14)';
      if (p.seed === undefined) return 'a panel has no frozen seed (D14)';
      if (typeof p.text !== 'string' || !p.text) return 'a panel has no prose for its caption';
    }
    // The detail screen reprints the wake line off the record (D42).
    if (!dreamWakeLine(entry)) return 'the filed record produces no wake line for the detail page';
    return true;
  })()`));

await check("a nap dream is labelled a nap — the label reads forSleep, never the D8 class",
  (() => {
    // The defect this was written for. `kind` is 'distorted' | 'true' |
    // 'recurring' and is NEVER 'nap'; nap-ness is `forSleep` (D16/D36). Both
    // renderers tested `kind`, so the ' · nap' suffix could not render for any
    // dream that has ever existed — invisible on screen, because the absence
    // of a label looks exactly like a night dream.
    for (const n of ['renderDreamDiary', 'renderDreamEntry']) {
      for (const b of bodies(n)) {
        if (/kind\s*===\s*'nap'/.test(b)) return n + " tests kind === 'nap', which is never true — nap-ness is forSleep";
        if (!/forSleep\s*===\s*'nap'/.test(b)) return n + ' never distinguishes a nap dream at all';
      }
    }
    return true;
  })());

await check('the record really can be nap-flagged, so the label above has something to read',
  api(`(() => {
    const gs = house('diary-nap');
    const nap = filed(gs, 2, 'nap');
    if (nap.forSleep !== 'nap') return 'a nap dream did not record forSleep';
    if (nap.kind === 'nap') return "a dream's D8 class came out as 'nap', which would make the old test accidentally right";
    if (!['distorted', 'true', 'recurring'].includes(nap.kind)) return 'unexpected class ' + nap.kind;
    return true;
  })()`));

console.log('\n3. the information economy — the diary never tells the player what was real (D2/D7)');

await check('neither renderer reveals a dream CLASS, and no class id is authored as a label',
  (() => {
    // D7 lets a true dream replay something the player never witnessed. That
    // is only safe because D2 makes a dream deniable: the player gains a
    // suspicion, never a fact. A diary that stamped an entry 'true' — or even
    // 'recurring', which says the same thing about a different night — would
    // hand them an oracle and quietly break the information economy the rest
    // of the game is built on. Nothing on screen shows this is missing, which
    // is exactly why it is asserted rather than eyeballed.
    for (const n of ['renderDreamDiary', 'renderDreamEntry']) {
      for (const b of bodies(n)) {
        if (/['"`]true['"`]/.test(b) || /['"`]recurring['"`]/.test(b) || /['"`]distorted['"`]/.test(b)) {
          return n + ' mentions a dream class by name — the diary must not report which dreams were real';
        }
        if (/recurrenceOf/.test(b)) return n + ' reads recurrenceOf, which tells the player this dream has come before';
        if (/\bsource\b/.test(b)) return n + " reads the record's source ids, which name the real event behind a true dream";
      }
    }
    return true;
  })());

console.log('\n4. the pixels — repaint from the frozen record, never from the plugin (D14/D40)');

await check('the panel loader goes through image.js and never touches the plugin',
  (() => {
    for (const b of bodies('loadDreamPanelIntoImg')) {
      if (/generateImage/.test(b)) return 'the diary calls the image plugin directly, bypassing the cache and the style funnel';
      if (!/getDreamPanelImage\(/.test(b)) return 'the diary does not repaint through image.js\'s cached getter';
      // D14: the record stores prompt and seed, never a blob. A loader that
      // read a stored url would show a broken image the first time the LRU
      // evicted a panel, which is landmine L10 all over again.
      if (/panel\.(url|blob)|dream\.(url|blob)/.test(b)) return 'the diary reads a stored blob off the record';
      // The renderScene stale-guard idiom: stamp the key, swap only if the
      // element is still mounted and still asking for that exact key.
      if (!/data-dream-key/.test(b)) return 'the async swap has no data-* stale guard';
      if (!/isConnected/.test(b)) return 'the async swap does not check the element is still mounted';
      if (!/getAttribute\('data-dream-key'\)\s*!==\s*key/.test(b)) return 'the async swap does not re-check its key before painting';
      // D40: the KEY varies with the device, the SEED never does.
      if (!/panel\s*&&\s*panel\.seed/.test(b)) return 'the info affordance does not report the record\'s own frozen seed (D40)';
    }
    return true;
  })());

await check('a filed entry survives a real save/load and still resolves its panel keys',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'diary-rt', clock: { day: 1, minutes: 0 } });
    const h = house('diary-rt');
    h.meta.clock.day = 6;
    const a = filed(h, 1, 'night');
    const b = filed(h, 2, 'nap');
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const diary = loaded.world.dreams.diary;
    if (!Array.isArray(diary) || diary.length !== 2) return 'the diary came back with ' + (diary ? diary.length : 'no') + ' entries';
    // Newest first — the gallery renders in array order and says so.
    if (diary[0].id !== b.id) return 'the reloaded diary is not newest-first, so the gallery would list it backwards';
    for (const entry of diary) {
      for (let i = 0; i < entry.panels.length; i++) {
        // The cache key is what the loader stamps and re-checks. It must be
        // computable from the RELOADED record alone (D14) — a key that needed
        // the live queue record would break the moment the queue moved on.
        const key = dreamPanelCacheKey(entry, i);
        if (!key || typeof key !== 'string') return 'a reloaded panel cannot compute its cache key';
        if (entry.panels[i].seed !== hashStr(composeDreamPanelKey(entry, i))) return 'a reloaded panel seed no longer matches its record';
      }
    }
    return true;
  })()`));

await check('the diary holds at diaryCap and the gallery never has more rows than that',
  api(`(() => {
    const gs = house('diary-cap');
    for (let i = 1; i <= DREAM_TUNING.diaryCap + 6; i++) {
      gs.meta.clock.day = i;
      gs.world.dreams.lastDreamDay = null;
      filed(gs, i, 'night');
    }
    const diary = gs.world.dreams.diary;
    if (diary.length !== DREAM_TUNING.diaryCap) return 'the diary holds ' + diary.length + ', cap is ' + DREAM_TUNING.diaryCap;
    const ids = new Set(diary.map((d) => d.id));
    if (ids.size !== diary.length) return 'the diary contains the same dream twice, so the gallery would render a duplicate row';
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
