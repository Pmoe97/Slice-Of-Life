// Runs every verify-*.js in this folder and reports the total.
//
//   node dev/verify/run-all.js
//
// Each harness is standalone (`node dev/verify/verify-s3.js` works on its own);
// this just runs the lot and gives one number. Exits non-zero if anything
// fails, so it can gate a commit.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname)
  .filter(f => /^verify-.*\.js$/.test(f))
  .sort();

let passed = 0, failed = 0, broken = 0;
for (const f of files) {
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const m = out.match(/^ {2}(\d+) passed, (\d+) failed$/m);
  if (!m) {
    broken++;
    console.log(`${f.padEnd(15)} DID NOT REPORT — ran with an error`);
    console.log(out.split('\n').filter(l => /Error|FAIL/.test(l)).slice(0, 4).map(l => '   ' + l).join('\n'));
    continue;
  }
  const [, p, fl] = m;
  passed += +p; failed += +fl;
  console.log(`${f.padEnd(15)} ${p.padStart(3)} passed, ${fl} failed`);
  if (+fl > 0) {
    console.log(out.split('\n').filter(l => l.includes('FAIL')).map(l => '   ' + l).join('\n'));
  }
}

console.log('-'.repeat(40));
console.log(`${passed} passed, ${failed} failed, ${broken} harness(es) errored`);
process.exit(failed > 0 || broken > 0 ? 1 : 0);
