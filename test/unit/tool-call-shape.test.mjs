// ⭐⭐⭐ NO HARNESS MAY READ TOOL ARGUMENTS OUT OF A FIELD THIS PERSONA DOES NOT WRITE.
//
//   node --test unit/tool-call-shape.test.mjs
//
// ── ⚠️⚠️ WHY THIS EXISTS AS A TEST RATHER THAN A NOTE ───────────────────────────────────────────────
// This persona stores a tool call as `{ id, name, args, result }`. OpenAI's wire shape is
// `{ function: { name, arguments } }`. Reading the second where the first is stored does not throw — it
// returns `undefined`, and every harness that did it printed a confident `args: {}`.
//
// ⭐ FOUR RECORDED INSTANCES, and the last one cost a finding: during the room-scoping run the trace
// reported that `retrieve_conversations` was called with NO arguments, while the row actually held
// `{"with":"Hermes","limit":8,"where":"Hermes"}` — the `where` argument WAS the measurement.
// ⇒ Ote: *"We've now seen this same instrumentation mistake enough times that I don't want it
// contaminating the Rome investigation."*
//
// ⛔ A SOURCE SCAN, DELIBERATELY. The defect is in how the harnesses READ, so no behavioural test can
// catch it — the only way to assert "nobody reads the wrong field first" is to look at the readers.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PIPE = new URL('../pipeline/', import.meta.url)
const dir = PIPE.pathname.replace(/^\//, '')

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.mjs'))
  .filter((f) => statSync(join(dir, f)).isFile())

// ⛔ ANCHOR FIRST. A scan whose pattern stops matching reports a triumphant pass over nothing; this
// project has five recorded instances of exactly that failure.
test('⛔ ANCHOR: the scan can see the pipeline harnesses', () => {
  assert.ok(files.length >= 10, `found ${files.length} harnesses`)
})

test('⭐⭐⭐ every harness that reads tool arguments tries `args` FIRST', () => {
  const offenders = []
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8')
    // Only files that actually read arguments are in scope.
    if (!/function\?\.\s*arguments|function\.arguments/.test(src)) continue
    // ⭐ The rule is about ORDER, not presence: keeping `function.arguments` as a FALLBACK is fine and
    // makes the harnesses portable. Reading it FIRST is the defect.
    const lines = src.split('\n').filter((l) => /function\??\.\s*arguments/.test(l) && !l.trim().startsWith('//'))
    for (const l of lines) {
      const argsIdx = l.indexOf('.args')
      const fnIdx = l.search(/function\??\.\s*arguments/)
      if (argsIdx === -1 || argsIdx > fnIdx) offenders.push(`${f}: ${l.trim().slice(0, 90)}`)
    }
  }
  assert.deepEqual(offenders, [], `these read the OpenAI shape before this persona's own:\n${offenders.join('\n')}`)
})

test('⭐ …and the shape this persona actually writes is the one documented here', () => {
  // A live row, so the test is anchored to reality rather than to my belief about it. Skipped rather
  // than failed when the file is absent — a missing fixture is not evidence of a defect.
  let sample
  try {
    sample = JSON.parse(readFileSync(new URL('../results/room-scoped-retrieval.json', import.meta.url), 'utf8'))
  } catch { return }
  const calls = sample?.model?.retrievals ?? []
  if (!calls.length) return
  // ⭐ THE POINT: the recorded arguments are non-empty objects. If the reader regresses, this goes to
  // `[{}]` and says so.
  assert.ok(calls.some((c) => c && Object.keys(c).length > 0),
    'recorded tool arguments are empty — the reader is pointed at the wrong field again')
})
