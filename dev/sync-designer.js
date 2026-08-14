// Injects the live DESIGN_SHAPES / ROOM_DECOR from src/srcfiles/defs.design.js
// into dev/designer.html, so the studio's palette can never drift from the
// shapes the game actually knows how to draw.
//
//   node dev/sync-designer.js
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
s = s.replace(/const SHAPES = [\s\S]*?;\nconst SHIPPED_DECOR = [\s\S]*?;\n/,
              `const SHAPES = ${shapes};\nconst SHIPPED_DECOR = ${decor};\n`);
fs.writeFileSync(p, s);
console.log(`synced ${Object.keys(api('DESIGN_SHAPES')).length} shapes, ` +
            `${Object.keys(api('ROOM_DECOR')).length} designed room(s) into dev/designer.html`);
