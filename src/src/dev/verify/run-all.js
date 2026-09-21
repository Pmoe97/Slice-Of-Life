// Runs every verify-*.js in this folder (or a filtered subset) and reports
// the total.
//
//   node src/src/dev/verify/run-all.js                # everything
//   node src/src/dev/verify/run-all.js w6 w9           # only names containing "w6" or "w9"
//   node src/src/dev/verify/run-all.js verify-plan.js  # exact name also works
//
// Each harness is standalone (`node src/src/dev/verify/verify-s3.js` works
// on its own) and has no shared state with any other harness, so matched
// harnesses run in parallel (bounded by CPU count) rather than one at a
// time. A full 111-harness sweep run sequentially got slow enough to make
// running it every session impractical (each harness reloads the whole
// ~58-file engine from scratch); the fix is this file, not skipping
// verification. Results are collected and printed in sorted file order
// regardless of finish order, so output stays stable and diffable.
// Exits non-zero if anything fails, so it can gate a commit.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const filters = process.argv.slice(2);
const files = fs.readdirSync(__dirname)
  .filter(f => /^verify-.*\.js$/.test(f))
  .filter(f => filters.length === 0 || filters.some(q => f.includes(q)))
  .sort();

if (files.length === 0) {
  console.log(`No verify-*.js file matches: ${filters.join(', ')}`);
  process.exit(1);
}

// Bounded so a full sweep doesn't try to spawn 111 Node processes at once —
// each harness itself does real CPU work (population-scale sim runs), not
// just I/O, so more workers than cores doesn't help past a point.
const CONCURRENCY = Math.max(1, Math.min(os.cpus().length, 8));

function runOne(f) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' }, (err, stdout, stderr) => {
      resolve({ f, out: (stdout || '') + (stderr || '') });
    });
  });
}

async function main() {
  const queue = [...files];
  const results = [];
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      results.push(await runOne(f));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  results.sort((a, b) => a.f.localeCompare(b.f));

  let passed = 0, failed = 0, broken = 0;
  for (const { f, out } of results) {
    // Whitespace before "N passed, M failed" is not a contract every harness
    // honors (some print it flush-left, some indented, some inside a banner)
    // — matching on exactly two spaces silently mis-filed seven harnesses
    // that ran and reported fine as "DID NOT REPORT" (2026-09-20 audit: the
    // voc-p1/p1-equiv/p2/p34/p56/p8/p9 family). The line itself, not its
    // indentation, is the contract.
    const m = out.match(/^\s*(\d+) passed, (\d+) failed$/m);
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
}

main();
