// RUN EVERYTHING THAT CAN RUN UNATTENDED.
//
//   npm test        (from test/)   → unit + checks
//
// ⚠️ `package.json` referenced this file for a while before it existed, so `npm run all` failed with
// MODULE_NOT_FOUND. A script that names a runner nobody wrote is worse than no script: it reads like
// coverage. If you add a suite, add it here — an unrun check is an unchecked check.
//
// WHAT IS DELIBERATELY NOT HERE: `repro/`. Those need a live model and take minutes, and a check that
// cannot finish gets skipped, then gets ignored, then gets deleted. OteLLMServices carried a "standing
// failure" for weeks that way. Run repros by hand, on purpose.
//
// The CHECKS need her running on :8210 — they drive the real HTTP surface, because the bugs they exist
// to catch (an unowned row, a leaked conversation) only appear when the whole stack is wired together.
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BASE } from '../harness.mjs'

const TEST_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

const run = (label, cmd, args) => new Promise((resolve) => {
  console.log(`\n${'─'.repeat(72)}\n▶ ${label}\n${'─'.repeat(72)}`)
  // ⚠️ NO `shell: true`. Node lives at "C:\Program Files\nodejs\node.exe" and going through cmd.exe
  // splits that on the space — every suite reported "'C:\Program' is not recognized" and the runner
  // showed 3 FAILs that were entirely its own. Spawning the executable directly needs no shell.
  const p = spawn(cmd, args, { cwd: TEST_DIR, stdio: 'inherit' })
  p.on('close', (code) => resolve({ label, code: code ?? 1 }))
})

// Fail FAST on the precondition rather than letting every check time out one by one and blaming itself.
let up = false
try { up = (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) })).ok } catch { up = false }
if (!up) {
  console.error(`\n✖ Sotera is not answering at ${BASE}.`)
  console.error('  Start her first:  cd Backend && npm start      (or run_windows.bat at the repo root)')
  console.error('  Nothing below is run — a suite that cannot reach the server would report ITS failure, not hers.')
  process.exit(1)
}

const results = []
// ⚠️ GLOB, NOT DIRECTORY. `node --test unit/` resolves `unit` as a MODULE on this build and dies with
// MODULE_NOT_FOUND — which the runner then reported as a failing test suite. Node expands this pattern
// itself, so it still needs no shell.
results.push(await run('unit', process.execPath, ['--test', 'unit/**/*.test.mjs']))
for (const f of readdirSync(join(TEST_DIR, 'checks')).filter((f) => f.endsWith('.mjs')).sort()) {
  results.push(await run(`check: ${f}`, process.execPath, [join('checks', f)]))
}

const failed = results.filter((r) => r.code !== 0)
console.log(`\n${'═'.repeat(72)}`)
for (const r of results) console.log(`  ${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.label}`)
console.log(`${'═'.repeat(72)}`)
console.log(failed.length ? `\n✖ ${failed.length} of ${results.length} suites FAILED` : `\n✓ all ${results.length} suites passed`)
process.exit(failed.length ? 1 : 0)
