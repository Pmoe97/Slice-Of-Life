// Injects the live DESIGN_SHAPES / ROOM_DECOR from src/src/srcfiles/defs.design.js
// into dev/designer.html, so the studio's palette can never drift from the
// shapes the game actually knows how to draw.
//
//   node src/src/dev/sync-designer.js
//
// Run it after editing defs.design.js by hand. (Editing it by hand is what
// the studio exists to avoid, but the shape LIBRARY is still authored there.)
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./verify/loadgame.js');
const { api } = loadEngine({ required: ['defs.design.js'] });

const shapes = JSON.stringify(api('DESIGN_SHAPES'), null, 1);
const decor = JSON.stringify(api('ROOM_DECOR'), null, 1);
const p = path.join(__dirname, 'designer.html');
let s = fs.readFileSync(p, 'utf8');
// designer.html is checked out CRLF on Windows — a bare \n here silently
// never matches (Phase 17: found mid-session when a newly added shape
// wasn't reaching the file despite this script reporting success).
s = s.replace(/const SHAPES = [\s\S]*?;\r?\nconst SHIPPED_DECOR = [\s\S]*?;\r?\n/,
              `const SHAPES = ${shapes};\nconst SHIPPED_DECOR = ${decor};\n`);

// Phase 17 (D55): normalizePlacement/placementFitsRoom are shared with the
// game byte-for-byte — .toString() on the LIVE function is the source of
// truth, injected between markers rather than hand-copied, so the two can
// never quietly drift (verify-plan.js §8 checks this).
const normalizePlacementSrc = api('normalizePlacement.toString()');
const placementFitsRoomSrc = api('placementFitsRoom.toString()');
s = s.replace(
  /(\/\/ --- normalizePlacement \(defs\.design\.js\)[\s\S]*?\n)function normalizePlacement[\s\S]*?\nfunction placementFitsRoom[\s\S]*?\n}\n(\/\/ --- \/normalizePlacement)/,
  (whole, head, tail) => `${head}${normalizePlacementSrc}\n${placementFitsRoomSrc}\n${tail}`
);
fs.writeFileSync(p, s);
console.log(`synced ${Object.keys(api('DESIGN_SHAPES')).length} shapes, ` +
            `${Object.keys(api('ROOM_DECOR')).length} designed room(s), and normalizePlacement into dev/designer.html`);
